import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

function isRecord(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): IDataObject[] {
	if (
		!Array.isArray(value) ||
		!value.every((item) => isRecord(item) && typeof item.id === 'string')
	) {
		throw new Error('TimeLodge returned an invalid record list.');
	}
	return value;
}

function record(value: unknown): IDataObject {
	if (!isRecord(value) || typeof value.id !== 'string') {
		throw new Error('TimeLodge returned an invalid record.');
	}
	return value;
}

async function request(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	options: {
		method: IHttpRequestMethods;
		path: string;
		body?: IDataObject;
		qs?: IDataObject;
		headers?: Record<string, string>;
	},
): Promise<IDataObject> {
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `https://timelodge.com/api/v1/${options.path}`,
		headers: { Accept: 'application/json', ...options.headers },
		json: true,
	};
	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}
	if (options.qs !== undefined) {
		requestOptions.qs = options.qs;
	}
	const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
		this,
		'timeLodgeApi',
		requestOptions,
	);
	if (!isRecord(response)) {
		throw new Error('TimeLodge returned an invalid response.');
	}
	return response;
}

async function page(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	options: { resource: string; page: number; perPage: number },
): Promise<{ data: IDataObject[]; hasMore: boolean }> {
	const response = await request.call(this, {
		method: 'GET',
		path: options.resource,
		qs: { page: options.page, per_page: options.perPage },
	});
	const data = records(response.data);
	const meta = response.meta;
	if (
		!isRecord(meta) ||
		meta.current_page !== options.page ||
		!Number.isSafeInteger(meta.last_page) ||
		Number(meta.last_page) < options.page
	) {
		throw new Error('TimeLodge returned invalid pagination metadata.');
	}
	return { data, hasMore: options.page < Number(meta.last_page) };
}

async function getMany(
	this: IExecuteFunctions,
	options: { resource: string; returnAll: boolean; limit: number },
): Promise<IDataObject[]> {
	const result: IDataObject[] = [];
	let nextPage = 1;
	while (true) {
		const response = await page.call(this, {
			resource: options.resource,
			page: nextPage,
			perPage: options.returnAll ? 100 : Math.min(options.limit, 100),
		});
		result.push(...response.data);
		if (!response.hasMore || (!options.returnAll && result.length >= options.limit)) {
			return options.returnAll ? result : result.slice(0, options.limit);
		}
		nextPage += 1;
	}
}

async function getClients(
	this: ILoadOptionsFunctions,
	filter = '',
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	let nextPage = Number(paginationToken ?? '1');
	if (!Number.isSafeInteger(nextPage) || nextPage < 1) {
		throw new NodeOperationError(this.getNode(), 'Invalid client list page.');
	}
	while (true) {
		const response = await page.call(this, { resource: 'clients', page: nextPage, perPage: 100 });
		const results = response.data
			.map((client) => ({
				name: String(client.display_name ?? client.legal_name ?? client.id),
				value: String(client.id),
			}))
			.filter((client) => client.name.toLowerCase().includes(filter.toLowerCase()));
		if (results.length > 0 || !response.hasMore) {
			return { results, paginationToken: response.hasMore ? String(nextPage + 1) : undefined };
		}
		nextPage += 1;
	}
}

export const timeLodgeTransport = { request, record, getMany, getClients };

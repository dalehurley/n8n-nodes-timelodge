import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { timeLodgeTransport } from './transport';

export class TimeLodge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TimeLodge',
		name: 'timeLodge',
		icon: { light: 'file:timelodge.svg', dark: 'file:timelodge.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with clients, projects, and recorded time in TimeLodge',
		defaults: { name: 'TimeLodge' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'timeLodgeApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'client',
				options: [
					{ name: 'Client', value: 'client' },
					{ name: 'Project', value: 'project' },
					{ name: 'Time Entry', value: 'timeEntry' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'getAll',
				displayOptions: { show: { resource: ['client'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a client',
						action: 'Create a client',
					},
					{ name: 'Get', value: 'get', description: 'Get a client', action: 'Get a client' },
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get many clients',
						action: 'Get many clients',
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'getAll',
				displayOptions: { show: { resource: ['project', 'timeEntry'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get many records',
						action: 'Get many records',
					},
				],
			},
			{
				displayName: 'Client',
				name: 'clientId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['client'], operation: ['get'] } },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'getClients', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: '01986f90-1c13-7f4b-bbfc-00000000002a',
					},
				],
			},
			{
				displayName: 'Display Name',
				name: 'displayName',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['client'], operation: ['create'] } },
				description: 'Name used to identify the client in TimeLodge',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['client'], operation: ['create'] } },
				description:
					'A unique, stable source-event identifier, up to 255 characters. Reuse it only with the identical client fields when retrying. TimeLodge documents a 24-hour replay window.',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['client'], operation: ['create'] } },
				options: [
					{
						displayName: 'Currency',
						name: 'currency',
						type: 'string',
						default: '',
						placeholder: 'AUD',
						description: 'Three-letter currency code. Leave empty to use the workspace default.',
					},
					{ displayName: 'Internal Code', name: 'internal_code', type: 'string', default: '' },
					{ displayName: 'Legal Name', name: 'legal_name', type: 'string', default: '' },
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
					},
				],
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['getAll'] } },
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1, maxValue: 1000 },
				displayOptions: { show: { operation: ['getAll'], returnAll: [false] } },
				description: 'Max number of results to return',
			},
		],
	};

	methods = { listSearch: { getClients: timeLodgeTransport.getClients } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				let records: IDataObject[];
				if (resource === 'client' && operation === 'create') {
					const displayName = (this.getNodeParameter('displayName', itemIndex) as string).trim();
					const key = this.getNodeParameter('idempotencyKey', itemIndex) as string;
					if (!displayName || !key.trim() || key.length > 255) {
						throw new NodeOperationError(
							this.getNode(),
							'Provide a display name and a stable idempotency key of 1–255 characters.',
							{ itemIndex },
						);
					}
					const additional = this.getNodeParameter(
						'additionalFields',
						itemIndex,
						{},
					) as IDataObject;
					const body: IDataObject = { display_name: displayName };
					for (const field of ['currency', 'internal_code', 'legal_name', 'notes']) {
						if (typeof additional[field] === 'string' && additional[field] !== '') {
							body[field] = additional[field];
						}
					}
					const response = await timeLodgeTransport.request.call(this, {
						method: 'POST',
						path: 'clients',
						body,
						headers: { 'Idempotency-Key': key },
					});
					records = [timeLodgeTransport.record(response.data)];
				} else if (resource === 'client' && operation === 'get') {
					const id = this.getNodeParameter('clientId', itemIndex, '', {
						extractValue: true,
					}) as string;
					if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
						throw new NodeOperationError(this.getNode(), 'Select a client or provide its UUID.', {
							itemIndex,
						});
					}
					const response = await timeLodgeTransport.request.call(this, {
						method: 'GET',
						path: `clients/${encodeURIComponent(id)}`,
					});
					records = [timeLodgeTransport.record(response.data)];
				} else if (
					operation === 'getAll' &&
					['client', 'project', 'timeEntry'].includes(resource)
				) {
					const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
					const limit = returnAll ? 100 : Number(this.getNodeParameter('limit', itemIndex));
					if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)) {
						throw new NodeOperationError(
							this.getNode(),
							'Limit must be a whole number from 1 to 1000.',
							{ itemIndex },
						);
					}
					const path = { client: 'clients', project: 'projects', timeEntry: 'time-entries' }[
						resource
					];
					records = await timeLodgeTransport.getMany.call(this, {
						resource: path!,
						returnAll,
						limit,
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						'Unsupported TimeLodge resource or operation.',
						{ itemIndex },
					);
				}
				output.push(...records.map((json) => ({ json, pairedItem: { item: itemIndex } })));
			} catch (error) {
				const safeError =
					error instanceof NodeOperationError
						? error
						: new NodeOperationError(
								this.getNode(),
								'TimeLodge request failed. Check the API token permissions, workspace subscription, selected fields, and API availability.',
								{ itemIndex },
							);
				if (!this.continueOnFail()) {
					throw safeError;
				}
				output.push({ json: { error: safeError.message }, pairedItem: { item: itemIndex } });
			}
		}
		return [output];
	}
}

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TimeLodge } = require('../dist/nodes/TimeLodge/TimeLodge.node');
const { TimeLodgeApi } = require('../dist/credentials/TimeLodgeApi.credentials');

function context(parameters, responder, count = 1, continueOnFail = false) {
	const calls = [];
	const inputs = Array.from({ length: count }, (_, index) => ({ json: { source: index } }));
	return {
		calls,
		inputs,
		getInputData: () => inputs,
		getNode: () => ({
			name: 'TimeLodge',
			type: 'timeLodge',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter(name, itemIndex, fallback) {
			const values = typeof parameters === 'function' ? parameters(itemIndex) : parameters;
			return Object.hasOwn(values, name) ? values[name] : fallback;
		},
		continueOnFail: () => continueOnFail,
		helpers: {
			async httpRequestWithAuthentication(credential, options) {
				calls.push({ credential, ...options });
				return responder(options, calls.length);
			},
		},
	};
}

function collection(data, currentPage = 1, lastPage = 1) {
	return {
		data,
		meta: { current_page: currentPage, per_page: 100, total: data.length, last_page: lastPage },
		links: { next: 'https://attacker.invalid/never-follow-this' },
	};
}

test('credentials use a password field, bearer header, and the side-effect-free workspace ping', () => {
	const credentials = new TimeLodgeApi();
	assert.equal(credentials.properties[0].typeOptions.password, true);
	assert.equal(
		credentials.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiToken}}',
	);
	assert.deepEqual(credentials.test.request, {
		baseURL: 'https://timelodge.com/api/v1',
		url: '/ping',
		method: 'GET',
	});
	assert.equal(
		credentials.properties.some((field) => /url|host/i.test(field.name)),
		false,
	);
});

test('get many paginates, honours the result limit, preserves source pairing and never follows a remote next URL', async () => {
	const execution = context(
		{ resource: 'client', operation: 'getAll', returnAll: false, limit: 150 },
		(options) =>
			collection(
				Array.from({ length: 100 }, (_, index) => ({
					id: String((options.qs.page - 1) * 100 + index),
					display_name: `Client ${index}`,
				})),
				options.qs.page,
				3,
			),
	);
	const [output] = await new TimeLodge().execute.call(execution);
	assert.equal(output.length, 150);
	assert.equal(output.at(-1).json.id, '149');
	assert.deepEqual(
		execution.calls.map((call) => call.qs),
		[
			{ page: 1, per_page: 100 },
			{ page: 2, per_page: 100 },
		],
	);
	assert.ok(
		execution.calls.every(
			(call) =>
				call.url === 'https://timelodge.com/api/v1/clients' && call.credential === 'timeLodgeApi',
		),
	);
	assert.ok(output.every((item) => item.pairedItem.item === 0));
	assert.deepEqual(execution.inputs, [{ json: { source: 0 } }]);
});

test('return all reads every page of recorded time and keeps raw API fields intact', async () => {
	const execution = context(
		{ resource: 'timeEntry', operation: 'getAll', returnAll: true },
		(options) =>
			collection(
				[{ id: `entry-${options.qs.page}`, duration_seconds: 3600, currency: 'AUD' }],
				options.qs.page,
				3,
			),
	);
	const [output] = await new TimeLodge().execute.call(execution);
	assert.equal(output.length, 3);
	assert.deepEqual(
		output.map((item) => item.json.id),
		['entry-1', 'entry-2', 'entry-3'],
	);
	assert.ok(output.every((item) => item.json.duration_seconds === 3600));
	assert.ok(execution.calls.every((call) => call.url.endsWith('/time-entries')));
});

test('project and empty-client pages are returned without inventing records', async () => {
	for (const [resource, path] of [
		['client', 'clients'],
		['project', 'projects'],
	]) {
		const execution = context({ resource, operation: 'getAll', returnAll: false, limit: 50 }, () =>
			collection([]),
		);
		assert.deepEqual(await new TimeLodge().execute.call(execution), [[]]);
		assert.equal(execution.calls[0].url, `https://timelodge.com/api/v1/${path}`);
	}
});

test('creating clients transmits only supported fields and the stable caller-provided idempotency key', async () => {
	const execution = context(
		{
			resource: 'client',
			operation: 'create',
			displayName: '  Harbour Design  ',
			idempotencyKey: 'crm-contact-84',
			additionalFields: {
				currency: '',
				internal_code: 'CRM-84',
				notes: 'Imported from CRM',
				team_id: 'other-workspace',
				token: 'must-not-forward',
			},
		},
		() => ({ data: { id: 'client-84', display_name: 'Harbour Design' } }),
	);
	const node = new TimeLodge();
	await node.execute.call(execution);
	await node.execute.call(execution);
	assert.deepEqual(execution.calls[0].body, {
		display_name: 'Harbour Design',
		internal_code: 'CRM-84',
		notes: 'Imported from CRM',
	});
	assert.deepEqual(execution.calls[0].headers, {
		Accept: 'application/json',
		'Idempotency-Key': 'crm-contact-84',
	});
	assert.deepEqual(execution.calls[1], execution.calls[0]);
	assert.equal(execution.calls[0].method, 'POST');
});

test('invalid or absent idempotency keys stop before any write', async () => {
	for (const key of ['', '   ', 'x'.repeat(256)]) {
		const execution = context(
			{ resource: 'client', operation: 'create', displayName: 'Test', idempotencyKey: key },
			() => {
				throw new Error('Unexpected network call');
			},
		);
		await assert.rejects(() => new TimeLodge().execute.call(execution), /idempotency key/i);
		assert.equal(execution.calls.length, 0);
	}
});

test('get client accepts a selected UUID and rejects path injection before making a request', async () => {
	const id = '01986f90-1c13-7f4b-bbfc-00000000002a';
	const execution = context({ resource: 'client', operation: 'get', clientId: id }, () => ({
		data: { id, display_name: 'Harbour Design' },
	}));
	const [output] = await new TimeLodge().execute.call(execution);
	assert.equal(output[0].json.id, id);
	assert.equal(execution.calls[0].url, `https://timelodge.com/api/v1/clients/${id}`);
	const unsafe = context(
		{ resource: 'client', operation: 'get', clientId: '../people' },
		() => ({}),
	);
	await assert.rejects(() => new TimeLodge().execute.call(unsafe), /UUID/);
	assert.equal(unsafe.calls.length, 0);
});

test('malformed API data or pagination fails instead of silently returning incomplete results', async () => {
	for (const response of [
		{ data: [] },
		{ data: [{ display_name: 'Missing ID' }], meta: { current_page: 1, last_page: 1 } },
		{ data: [], meta: { current_page: 0, last_page: 1 } },
		{ data: [], meta: { current_page: 1, last_page: '2' } },
	]) {
		const execution = context(
			{ resource: 'client', operation: 'getAll', returnAll: true },
			() => response,
		);
		await assert.rejects(() => new TimeLodge().execute.call(execution), /TimeLodge request failed/);
		assert.equal(execution.calls.length, 1);
	}
});

test('authentication failures do not leak credentials in thrown or continue-on-fail output', async () => {
	for (const shouldContinue of [false, true]) {
		const execution = context(
			{ resource: 'client', operation: 'getAll', returnAll: false, limit: 5 },
			() => {
				throw new Error('401 Authorization: Bearer do-not-leak');
			},
			1,
			shouldContinue,
		);
		if (shouldContinue) {
			const output = await new TimeLodge().execute.call(execution);
			assert.match(output[0][0].json.error, /token permissions/);
			assert.equal(JSON.stringify(output).includes('do-not-leak'), false);
		} else {
			await assert.rejects(
				() => new TimeLodge().execute.call(execution),
				(error) => !error.message.includes('do-not-leak'),
			);
		}
	}
});

test('per-input processing pairs each result to its own source item', async () => {
	const execution = context(
		(index) => ({
			resource: 'client',
			operation: 'create',
			displayName: `Client ${index}`,
			idempotencyKey: `source-${index}`,
		}),
		(options) => ({ data: { id: options.headers['Idempotency-Key'] } }),
		2,
	);
	const [output] = await new TimeLodge().execute.call(execution);
	assert.deepEqual(
		output.map((item) => item.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
	assert.deepEqual(
		output.map((item) => item.json.id),
		['source-0', 'source-1'],
	);
});

test('client search reaches a later page instead of falsely reporting no matching client', async () => {
	const execution = context({}, (options) =>
		collection(
			[
				{
					id: String(options.qs.page),
					display_name: options.qs.page === 1 ? 'Other Client' : 'Harbour Design',
				},
			],
			options.qs.page,
			3,
		),
	);
	const result = await new TimeLodge().methods.listSearch.getClients.call(execution, 'harbour');
	assert.deepEqual(result, {
		results: [{ name: 'Harbour Design', value: '2' }],
		paginationToken: '3',
	});
	assert.equal(execution.calls.length, 2);
});

test('invalid limits and unsupported operations do not make network calls', async () => {
	for (const params of [
		{ resource: 'project', operation: 'delete' },
		{ resource: 'people', operation: 'getAll' },
		{ resource: 'client', operation: 'getAll', returnAll: false, limit: 0 },
	]) {
		const execution = context(params, () => ({}));
		await assert.rejects(() => new TimeLodge().execute.call(execution));
		assert.equal(execution.calls.length, 0);
	}
});

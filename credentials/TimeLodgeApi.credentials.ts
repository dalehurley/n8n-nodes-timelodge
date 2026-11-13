import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TimeLodgeApi implements ICredentialType {
	name = 'timeLodgeApi';
	displayName = 'TimeLodge API';
	documentationUrl = 'https://timelodge.com/developers';
	icon = 'file:../nodes/TimeLodge/timelodge.svg' as const;
	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'In TimeLodge, open the account menu, select API & webhooks, and create a service token for the workspace you want to connect. Choose only the read or write permissions needed by your workflow.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: { Authorization: '=Bearer {{$credentials.apiToken}}', Accept: 'application/json' },
		},
	};
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://timelodge.com/api/v1', url: '/ping', method: 'GET' },
	};
}

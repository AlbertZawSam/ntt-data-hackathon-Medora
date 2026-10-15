import { defineBackend } from '@aws-amplify/backend';
import { Tags } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { postConfirmation } from './auth/post-confirmation/resource';
import { data } from './data/resource';
import { agentRunner } from './functions/agent-runner/resource';

const backend = defineBackend({ auth, postConfirmation, data, agentRunner });

// Tag every resource so Cost Explorer shows spend per stage (AGENTS.md section 5).
const app = backend.stack.node.root;
Tags.of(app).add('project', 'medora');
Tags.of(app).add('stage', process.env.AWS_BRANCH === 'prod' ? 'prod' : 'dev');

// The app may only write these attributes; hospital and approval are set by the backend,
// so nobody can approve themselves or claim another hospital.
const { cfnUserPoolClient } = backend.auth.resources.cfnResources;
cfnUserPoolClient.writeAttributes = ['email', 'custom:role', 'custom:requestedHospitalId'];
// Sign-in errors never reveal whether an email is registered (Requirement 1.6).
cfnUserPoolClient.preventUserExistenceErrors = 'ENABLED';

// Bedrock, Knowledge Base, and Amazon Location permissions are intentionally not attached here.
// AGENTS.md forbids coding-agent IAM changes; the team lead must grant the narrowly scoped
// `bedrock:InvokeModel`, `bedrock:Retrieve`, and `geo:CalculateRouteMatrix` permissions before
// enabling the model path. Until then the coordinator takes its fixed-rule backup path.

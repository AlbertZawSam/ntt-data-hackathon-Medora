import { defineBackend } from '@aws-amplify/backend';
import { Tags } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { postConfirmation } from './auth/post-confirmation/resource';

const backend = defineBackend({ auth, postConfirmation });

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

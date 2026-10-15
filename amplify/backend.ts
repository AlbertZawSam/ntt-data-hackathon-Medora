import { defineBackend } from '@aws-amplify/backend';
import { Tags } from 'aws-cdk-lib';

import { auth } from './auth/resource';
import { data } from './data/resource';

const backend = defineBackend({
  auth,
  data,
});

// Every resource carries project and stage tags so Cost Explorer shows spend per stage.
Tags.of(backend.stack).add('project', 'medora');
Tags.of(backend.stack).add('stage', process.env.AWS_BRANCH ?? 'dev');

// Users may update their own email only. Without this, Cognito lets a signed-in user
// rewrite custom:hospitalId and see another hospital's requests.
backend.auth.resources.cfnResources.cfnUserPoolClient.writeAttributes = ['email'];

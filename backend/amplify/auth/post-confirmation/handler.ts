import {
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { GROUPS, groupsForRole } from '@medora/shared/logic/session';

const cognito = new CognitoIdentityProviderClient();

export const handler: PostConfirmationTriggerHandler = async (event) => {
  // Also fires after a forgotten-password reset; groups are only assigned once, at sign-up.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

  const { userPoolId, userName } = event;
  const groups = groupsForRole(event.request.userAttributes['custom:role']);

  for (const group of groups) {
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: userName, GroupName: group }));
  }

  if (groups.includes(GROUPS.doctors)) {
    // Doctors wait for an admin of their hospital to approve them.
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: userName,
        UserAttributes: [{ Name: 'custom:approved', Value: 'false' }],
      }),
    );
  }

  return event;
};

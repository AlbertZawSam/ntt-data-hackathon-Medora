import { defineAuth } from '@aws-amplify/backend';

// Cognito user pool: email and password sign-in, one group per role (requirement 1).
// Staff and doctors carry their hospital in custom:hospitalId (e.g. "H02"); only scripts/admins set it.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['patients', 'hospital_staff', 'doctors', 'admins'],
  userAttributes: {
    'custom:hospitalId': {
      dataType: 'String',
      mutable: true,
      maxLen: 8,
    },
  },
});

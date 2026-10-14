import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';

/**
 * Cognito user pool: email sign-up with a verification code.
 * `custom:role` is chosen at sign-up; `custom:hospitalId` and `custom:approved` are written only
 * by the backend (the app client can't write them; see backend.ts).
 * Cost: no charge while idle; free tier covers the first 10,000 monthly active users.
 * Requirements: 1.1, 1.2, 18.1, 18.6
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailSubject: 'Your Medora verification code / รหัสยืนยัน Medora',
      verificationEmailBody: (code: () => string) =>
        `Your Medora verification code is ${code()}\nรหัสยืนยัน Medora ของคุณคือ ${code()}`,
    },
  },
  userAttributes: {
    'custom:role': { dataType: 'String', mutable: false, maxLen: 16 },
    'custom:hospitalId': { dataType: 'String', mutable: true, maxLen: 64 },
    'custom:approved': { dataType: 'String', mutable: true, maxLen: 5 },
    /** Doctors: the hospital they say they work at, until an admin there approves them. */
    'custom:requestedHospitalId': { dataType: 'String', mutable: true, maxLen: 64 },
  },
  groups: ['patients', 'hospital_staff', 'doctors', 'admins'],
  triggers: { postConfirmation },
  access: (allow) => [allow.resource(postConfirmation).to(['addUserToGroup', 'updateUserAttributes'])],
});

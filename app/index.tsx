import { Redirect } from 'expo-router';

// Until sign-in exists (task 5), everyone lands on the patient screens.
export default function Index() {
  return <Redirect href="/home" />;
}

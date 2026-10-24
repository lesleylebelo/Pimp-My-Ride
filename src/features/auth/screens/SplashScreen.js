import React, {useEffect} from 'react';
// Compatibility route for saved navigation state; startup animation lives above navigation.
export default function SplashScreen({navigation}) {
  useEffect(() => { navigation.replace('SignIn'); }, [navigation]);
  return null;
}

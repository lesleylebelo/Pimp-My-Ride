import React, { useEffect, useState } from 'react';
import {View,Text,Image,StyleSheet,StatusBar,} from 'react-native';
import logo from '../../../assets/images/SplashLogo.png';

export default function HomePage({ navigation }) {

  const appName = 'PimpMyRide';
  const slogan = 'Customize. Connect. Drive Your Style.';

  const [typedName, setTypedName] = useState('');
  const [typedSlogan, setTypedSlogan] = useState('');

  useEffect(() => {
    let nameIndex = 0;
    let sloganIndex = 0;
    let sloganTimer;
    let navigationTimer;

    // TYPE APP NAME
    const nameTimer = setInterval(() => {

      if (nameIndex < appName.length) {
        setTypedName(
          appName.substring(0, nameIndex + 1)
        );

        nameIndex++;
      } else {
        clearInterval(nameTimer);

        // TYPE SLOGAN
        sloganTimer = setInterval(() => {

          if (sloganIndex < slogan.length) {
            setTypedSlogan(
              slogan.substring(0, sloganIndex + 1)
            );

            sloganIndex++;
          } else {
            clearInterval(sloganTimer);

            // GO TO SIGN IN
            navigationTimer = setTimeout(() => {
              navigation.replace(
                'VehicleOwnerSignIn'
              );
            }, 1000);
          }

        }, 65);
      }

    }, 120);

    return () => {
      clearInterval(nameTimer);

      if (sloganTimer) {
        clearInterval(sloganTimer);
      }

      if (navigationTimer) {
        clearTimeout(navigationTimer);
      }
    };

  }, [navigation]);

  return (
    <View style={styles.container}>

      <StatusBar
        backgroundColor="#063D2E"
        barStyle="light-content"
      />

      <View style={styles.centerContent}>

        {/* LOGO */}
        <View style={styles.logoBox}>
          <Image
            source={logo}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* APP NAME */}
        <Text style={styles.appName}>
          {typedName}
        </Text>

        {/* SLOGAN */}
        <Text style={styles.slogan}>
          {typedSlogan}
        </Text>

      </View>

      {/* THREE DOTS */}
      <View style={styles.dotsContainer}>
        <View style={styles.activeDot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#063D2E',
  },

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 25,
  },

  logoBox: {
    width: 100,
    height: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 28,
  },

  logo: {
    width: 85,
    height: 85,
  },

  appName: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '700',
    textAlign: 'center',
    minHeight: 48,
  },

  slogan: {
    color: '#D4DED9',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 16,
    minHeight: 30,
  },

  dotsContainer: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
  },

  activeDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },

  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

});
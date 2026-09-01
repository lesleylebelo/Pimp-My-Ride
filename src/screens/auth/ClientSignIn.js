import React, { useState } from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet, SafeAreaView,StatusBar,Image} from 'react-native';
import logo from '../assets/GeneralLogo.png';

export default function VehicleOwnerSignIn({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F2F2F2"
      />

      <View style={styles.container}>

        <View style={styles.header}>
          <View style={styles.iconBox} >
            <Image source={logo} style={styles.logo} />
          </View>

          <View>
            <Text style={styles.welcomeText}>Welcome Back
            </Text>

            <Text style={styles.subText}>
              Sign in to manage your garage
            </Text>
          </View>
        </View>

        {/* TOP TABS */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={styles.activeTab}
          >
            <Text style={styles.activeTabText}>
              Vehicle Owner
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.inactiveTab}
            onPress={() =>
              navigation.replace('CustomShopSignIn')
            }
          >
            <Text style={styles.inactiveTabText}>
              Custom Shop
            </Text>
          </TouchableOpacity>
        </View>

        {/* SOCIAL BUTTONS */}
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialButton}>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.socialText}>Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.socialButton}>
            <Text style={styles.appleIcon}></Text>
            <Text style={styles.socialText}>Apple</Text>
          </TouchableOpacity>
        </View>

        {/* DIVIDER */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />

          <Text style={styles.dividerText}>
            or continue with email
          </Text>

          <View style={styles.dividerLine} />
        </View>

        {/* EMAIL */}
        <Text style={styles.label}>
          Email Address
        </Text>

        <TextInput
          style={styles.input}
          placeholder="example@gmail.com"
          placeholderTextColor="#999999"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        {/* PASSWORD */}
        <Text style={styles.label}>
          Password
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor="#999999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.forgotButton}>
          <Text style={styles.forgotText}>
            Forgot Password?
          </Text>
        </TouchableOpacity>

        {/* SIGN IN */}
        <TouchableOpacity style={styles.signInButton}>
          <Text style={styles.signInText}>
            Sign In
          </Text>
        </TouchableOpacity>

        {/* SIGN UP */}
        <View style={styles.signUpRow}>
          <Text style={styles.normalText}>
            Don't have an account?
          </Text>

          <TouchableOpacity
            onPress={() =>
              navigation.navigate('VehicleOwnerCreateAccount')
            }
          >
            <Text style={styles.signUpText}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },

  container: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 55,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },

  iconBox: {
    width: 48,
    height: 48,
    backgroundColor: '#0B4F3A',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

iconBox: {
  width: 48,
  height: 48,
  backgroundColor: '#FFFFFF',
  borderRadius: 8,
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 12,
  overflow: 'hidden',
},

logo: {
  width: 42,
  height: 42,
},

  welcomeText: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111111',
  },

  subText: {
    fontSize: 10,
    color: '#333333',
    marginTop: 2,
  },

  tabContainer: {
    height: 44,
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 28,
  },

  activeTab: {
    flex: 1,
    backgroundColor: '#0B4F3A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inactiveTab: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeTabText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },

  inactiveTabText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '500',
  },

  socialRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 24,
  },

  socialButton: {
    flex: 1,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
  },

  googleIcon: {
    fontSize: 17,
    fontWeight: '800',
  },

  appleIcon: {
    fontSize: 20,
    color: '#000000',
  },

  socialText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#B8B8B8',
  },

  dividerText: {
    fontSize: 9,
    color: '#8E8E8E',
    marginHorizontal: 11,
  },

  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 8,
  },

  input: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 11,
    color: '#111111',
    marginBottom: 19,
  },

  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -7,
    marginBottom: 24,
  },

  forgotText: {
    fontSize: 10,
    color: '#0B4F3A',
    fontWeight: '700',
  },

  signInButton: {
    height: 48,
    backgroundColor: '#0B4F3A',
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },

  signInText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 11,
    gap: 5,
  },

  normalText: {
    fontSize: 10,
    color: '#111111',
  },

  signUpText: {
    fontSize: 10,
    color: '#0B4F3A',
    fontWeight: '700',
  },
});
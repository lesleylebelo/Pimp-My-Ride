import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';

export default function CustomShopCreateAccount({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0B4F3A"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Create Account
          </Text>

          <Text style={styles.headerSubtitle}>
            Sign up to manage your garage
          </Text>
        </View>

        <View style={styles.body}>

          {/* ACCOUNT TYPE TABS */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={styles.inactiveTab}
              onPress={() =>
                navigation.replace('VehicleOwnerCreateAccount')
              }
            >
              <Text style={styles.inactiveTabText}>
                Vehicle Owner
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.activeTab}>
              <Text style={styles.activeTabText}>
                Custom Shop
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>
            Full Name
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor="#999999"
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={styles.label}>
            Email Address
          </Text>

          <TextInput
            style={styles.input}
            placeholder="example@gmail.com"
            placeholderTextColor="#999999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>
            Phone Number
          </Text>

          <TextInput
            style={styles.input}
            placeholder="+27 XX XXX XXXX"
            placeholderTextColor="#999999"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>
            Password
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Min. 8 characters"
            placeholderTextColor="#999999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>
            Confirm Password
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor="#999999"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <View style={styles.termsRow}>
            <Text style={styles.termsNormal}>
              I agree to PimpMyRide's
            </Text>

            <TouchableOpacity>
              <Text style={styles.termsLink}>
                Terms of Service
              </Text>
            </TouchableOpacity>

            <Text style={styles.termsNormal}>
              and
            </Text>

            <TouchableOpacity>
              <Text style={styles.termsLink}>
                Privacy Policy
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.createButton}>
            <Text style={styles.createButtonText}>
              Create Account
            </Text>
          </TouchableOpacity>

          <View style={styles.signInRow}>
            <Text style={styles.signInNormal}>
              Already have an account?
            </Text>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('CustomShopSignIn')
              }
            >
              <Text style={styles.signInLink}>
                Sign In
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },

  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#F2F2F2',
  },

  header: {
    backgroundColor: '#0B4F3A',
    paddingTop: 42,
    paddingBottom: 22,
    alignItems: 'center',
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#FFFFFF',
    fontSize: 9,
    marginTop: 8,
  },

  body: {
    paddingHorizontal: 25,
    paddingTop: 24,
    paddingBottom: 35,
  },

  tabContainer: {
    height: 44,
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 20,
  },

  activeTab: {
    flex: 1,
    backgroundColor: '#0B4F3A',
    justifyContent: 'center',
    alignItems: 'center',
  },

  inactiveTab: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
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

  label: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 7,
  },

  input: {
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 11,
    color: '#111111',
    marginBottom: 14,
  },

  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: -2,
    marginBottom: 18,
    gap: 3,
  },

  termsNormal: {
    fontSize: 8,
    color: '#999999',
  },

  termsLink: {
    fontSize: 8,
    color: '#0B4F3A',
    fontWeight: '700',
  },

  createButton: {
    height: 46,
    backgroundColor: '#0B4F3A',
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },

  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 4,
  },

  signInNormal: {
    color: '#111111',
    fontSize: 10,
  },

  signInLink: {
    color: '#0B4F3A',
    fontSize: 10,
    fontWeight: '700',
  },
});
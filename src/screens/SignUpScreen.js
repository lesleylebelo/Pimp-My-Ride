import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AuthHeader from "../components/AuthHeader";
import RoleToggle from "../components/RoleToggle";
import AppTextInput from "../components/AppTextInput";
import PrimaryButton from "../components/PrimaryButton";
import UploadField from "../components/UploadField";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  shopName: "",
  regNumber: "",
  address: "",
  city: "",
  province: "",
  services: "",
  cipcCert: null,
  proofOfAddress: null,
  ownerId: null,
};

export default function SignUpScreen({ navigation, route }) {
  const initialRole = route?.params?.role === "shop" ? "shop" : "owner";
  const [role, setRole] = useState(initialRole);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);

  const totalSteps = role === "shop" ? 3 : 1;

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const goBack = () => {
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      navigation.goBack();
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    setStep(1);
  };

  const handlePrimaryAction = () => {
    if (role === "owner") {
      // Frontend-only for now — wire up Firebase Auth here later.
      navigation.replace("SignIn");
      return;
    }
    // Custom Shop flow
    if (step < 3) {
      setStep((s) => s + 1);
    } else {
      // Frontend-only for now — wire up submission/verification here later.
      navigation.replace("SignIn");
    }
  };

  const headerTitle = "Create Account";
  const headerSubtitle =
    step === 1
      ? role === "owner"
        ? "Sign up to manage your garage"
        : "Account Details"
      : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <AuthHeader title={headerTitle} subtitle={headerSubtitle} />

          <View style={styles.body}>
            {step === 2 && <Text style={styles.stepHeading}>Shop Details</Text>}
            {step === 3 && <Text style={styles.stepHeading}>Verification</Text>}

            {step === 1 && (
              <RoleToggle role={role} onChange={handleRoleChange} />
            )}

            {step === 1 && role === "owner" && (
              <OwnerFields form={form} setField={setField} />
            )}

            {step === 1 && role === "shop" && (
              <ShopAccountFields form={form} setField={setField} />
            )}

            {step === 2 && role === "shop" && (
              <ShopDetailsFields form={form} setField={setField} />
            )}

            {step === 3 && role === "shop" && (
              <VerificationFields form={form} setField={setField} />
            )}

            {step === 1 && (
              <Text style={styles.terms}>
                I agree to PimpMyRide&apos;s{" "}
                <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            )}

            <PrimaryButton
              title={
                role === "owner" ? "Create Account" : step === 3 ? "Submit Registration" : "Next"
              }
              onPress={handlePrimaryAction}
              style={{ marginTop: spacing.lg }}
            />

            {step === 1 && (
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <Pressable onPress={() => navigation.navigate("SignIn")}>
                  <Text style={styles.footerLink}>Sign In</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function OwnerFields({ form, setField }) {
  return (
    <>
      <AppTextInput
        label="Full Name"
        placeholder="Enter your full name"
        value={form.fullName}
        onChangeText={setField("fullName")}
      />
      <AppTextInput
        label="Email Address"
        placeholder="example@gmail.com"
        value={form.email}
        onChangeText={setField("email")}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <AppTextInput
        label="Phone Number"
        placeholder="+27 XX XXX XXX"
        value={form.phone}
        onChangeText={setField("phone")}
        keyboardType="phone-pad"
      />
      <AppTextInput
        label="Password"
        placeholder="Min. 8 characters"
        value={form.password}
        onChangeText={setField("password")}
        secureTextEntry
      />
      <AppTextInput
        label="Confirm Password"
        placeholder="Re-enter password"
        value={form.confirmPassword}
        onChangeText={setField("confirmPassword")}
        secureTextEntry
      />
    </>
  );
}

function ShopAccountFields({ form, setField }) {
  return (
    <>
      <AppTextInput
        label="Owner/Representative"
        placeholder="Enter your full name"
        value={form.fullName}
        onChangeText={setField("fullName")}
      />
      <AppTextInput
        label="Email Address"
        placeholder="example@gmail.com"
        value={form.email}
        onChangeText={setField("email")}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <AppTextInput
        label="Phone Number"
        placeholder="+27 XX XXX XXX"
        value={form.phone}
        onChangeText={setField("phone")}
        keyboardType="phone-pad"
      />
      <AppTextInput
        label="Password"
        placeholder="Min. 8 characters"
        value={form.password}
        onChangeText={setField("password")}
        secureTextEntry
      />
      <AppTextInput
        label="Confirm Password"
        placeholder="Re-enter password"
        value={form.confirmPassword}
        onChangeText={setField("confirmPassword")}
        secureTextEntry
      />
    </>
  );
}

function ShopDetailsFields({ form, setField }) {
  return (
    <>
      <AppTextInput
        label="Shop Name"
        placeholder="Enter your shop name"
        value={form.shopName}
        onChangeText={setField("shopName")}
      />
      <AppTextInput
        label="Business Registration Number"
        placeholder="Enter your business registration number"
        value={form.regNumber}
        onChangeText={setField("regNumber")}
      />
      <AppTextInput
        label="Physical Address"
        placeholder="Enter your physical address"
        value={form.address}
        onChangeText={setField("address")}
      />
      <AppTextInput
        label="City"
        placeholder="Enter your city"
        value={form.city}
        onChangeText={setField("city")}
      />
      <AppTextInput
        label="Province"
        placeholder="Enter your province"
        value={form.province}
        onChangeText={setField("province")}
      />
      <AppTextInput
        label="Services offered"
        placeholder="Services you offer"
        value={form.services}
        onChangeText={setField("services")}
        multiline
      />
    </>
  );
}

function VerificationFields({ form, setField }) {
  // File picking is stubbed for now — wire up expo-image-picker /
  // expo-document-picker here when backend/storage integration begins.
  return (
    <>
      <UploadField
        label="CIPC Registration Certificate"
        fileName={form.cipcCert}
        onPress={() => setField("cipcCert")("document.pdf")}
      />
      <UploadField
        label="Proof of Address"
        fileName={form.proofOfAddress}
        onPress={() => setField("proofOfAddress")("document.pdf")}
      />
      <UploadField
        label="Owner/Representative ID"
        fileName={form.ownerId}
        onPress={() => setField("ownerId")("document.pdf")}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  body: {
    padding: spacing.lg,
  },
  stepHeading: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  terms: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: "700",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  footerText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },
});

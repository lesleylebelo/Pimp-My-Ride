import { useFocusEffect } from '@react-navigation/native';
import { Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { register } from '../services/accounts';
import { authError } from '../utils/authErrors';
import { registrationErrors } from '../utils/registration';
import React, { useState, useEffect, useCallback } from "react";
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
import AppTextInput from "../../../shared/components/AppTextInput";
import PrimaryButton from "../../../shared/components/PrimaryButton";
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";

const initialForm = {
  agreed: false,
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
};

export default function SignUpScreen({ navigation, route }) {
  const initialRole = route?.params?.role === "shop" ? "shop" : "owner";
  const [role, setRole] = useState(initialRole);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialForm);

  const {run,offline} = useAuth();
  const [errors,setErrors] = useState({});
  const [loading,setLoading] = useState(false);
  const [submitError,setSubmitError] = useState('');
  useEffect(() => { setRole(initialRole);setStep(1);setErrors({}); }, [initialRole]);
  

  const setField = key => value => {
    const next={...form,[key]:value};setForm(next);setSubmitError('');
    const issues={...registrationErrors(next,role,1),...registrationErrors(next,role,2)};
    setErrors(previous=>({...previous,[key]:issues[key]||null,
      ...(key==='password' && next.confirmPassword ? {confirmPassword:issues.confirmPassword||null} : {})}));
  };

  const goBack = () => {
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      navigation.goBack();
    }
  };

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, navigation]));

  const handleRoleChange = (nextRole) => {
    setErrors({});setSubmitError('');
    setRole(nextRole);
    setStep(1);
  };

  const handlePrimaryAction = async () => {
    if (loading) return;
    const issues=registrationErrors(form,role,step);setErrors(issues);
    if(Object.keys(issues).length) return;
    if(role==='shop' && step<2) {setStep(step+1);return;}
    setLoading(true);setSubmitError('');
    try { await run(async()=> {
      await register(form,role);

    }); }
    catch(error) {setSubmitError(authError(error));Alert.alert('Registration needs attention',authError(error));}
    finally {setLoading(false);}
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

          <View style={styles.body} pointerEvents={loading ? "none" : "auto"}>
            {step > 1 && <Pressable onPress={goBack}><Text style={styles.termsLink}>Back</Text></Pressable>}
            {step === 2 && <Text style={styles.stepHeading}>Shop Details</Text>}

            {step === 1 && (
              <RoleToggle role={role} onChange={handleRoleChange} />
            )}

            {step === 1 && role === "owner" && (
              <OwnerFields form={form} setField={setField} errors={errors} />
            )}

            {step === 1 && role === "shop" && (
              <ShopAccountFields form={form} setField={setField} errors={errors} />
            )}

            {step === 2 && role === "shop" && (
              <ShopDetailsFields form={form} setField={setField} errors={errors} />
            )}



            {step === 1 && <View>
              <Pressable accessibilityRole="checkbox" accessibilityState={{checked:form.agreed}} onPress={()=>setField('agreed')(!form.agreed)}>
                <Text style={styles.terms}>{form.agreed ? '☑' : '☐'} I accept the terms and privacy notice.</Text>
              </Pressable>
              <Pressable onPress={()=>navigation.navigate('Legal')}><Text style={styles.termsLink}>Read terms and privacy notice</Text></Pressable>
              {errors.agreed && <Text style={{color:colors.error}}>{errors.agreed}</Text>}
            </View>}
            <Text>{offline ? "Connect to the internet to create an account." : role === "shop" ? "After verifying your email, upload your shop documents for review." : ""}</Text>
            <Text accessibilityRole="alert" style={{color:colors.error}}>{submitError}</Text>

            <PrimaryButton
              title={
                role === "owner" ? "Create Account" : step === 2 ? "Create Shop Account" : "Next"
              }
              loading={loading}
              disabled={offline}
              onPress={handlePrimaryAction}
              style={{ marginTop: spacing.lg }}
            />

            {step === 1 && (
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <Pressable onPress={() => navigation.navigate("SignIn", { role })}>
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

function OwnerFields({ form, setField, errors }) {
  return (
    <>
      <AppTextInput
        label="Full Name"
        placeholder="Enter your full name"
        value={form.fullName}
        onChangeText={setField("fullName")}
        error={errors.fullName}
      />
      <AppTextInput
        label="Email Address"
        placeholder="example@gmail.com"
        value={form.email}
        onChangeText={setField("email")}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <AppTextInput
        label="Phone Number"
        placeholder="+27 XX XXX XXX"
        value={form.phone}
        onChangeText={setField("phone")}
        error={errors.phone}
        keyboardType="phone-pad"
      />
      <AppTextInput
        label="Password"
        placeholder="Min. 12 characters"
        value={form.password}
        onChangeText={setField("password")}
        error={errors.password}
        showPasswordToggle
        autoCapitalize="none"
        secureTextEntry
      />
      <AppTextInput
        label="Confirm Password"
        placeholder="Re-enter password"
        value={form.confirmPassword}
        onChangeText={setField("confirmPassword")}
        error={errors.confirmPassword}
        showPasswordToggle
        autoCapitalize="none"
        secureTextEntry
      />
    </>
  );
}

function ShopAccountFields({ form, setField, errors }) {
  return (
    <>
      <AppTextInput
        label="Owner/Representative"
        placeholder="Enter your full name"
        value={form.fullName}
        onChangeText={setField("fullName")}
        error={errors.fullName}
      />
      <AppTextInput
        label="Email Address"
        placeholder="example@gmail.com"
        value={form.email}
        onChangeText={setField("email")}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <AppTextInput
        label="Phone Number"
        placeholder="+27 XX XXX XXX"
        value={form.phone}
        onChangeText={setField("phone")}
        error={errors.phone}
        keyboardType="phone-pad"
      />
      <AppTextInput
        label="Password"
        placeholder="Min. 12 characters"
        value={form.password}
        onChangeText={setField("password")}
        error={errors.password}
        showPasswordToggle
        autoCapitalize="none"
        secureTextEntry
      />
      <AppTextInput
        label="Confirm Password"
        placeholder="Re-enter password"
        value={form.confirmPassword}
        onChangeText={setField("confirmPassword")}
        error={errors.confirmPassword}
        showPasswordToggle
        autoCapitalize="none"
        secureTextEntry
      />
    </>
  );
}

function ShopDetailsFields({ form, setField, errors }) {
  return (
    <>
      <AppTextInput
        label="Shop Name"
        placeholder="Enter your shop name"
        value={form.shopName}
        onChangeText={setField("shopName")}
        error={errors.shopName}
      />
      <AppTextInput
        label="Business Registration Number"
        placeholder="Enter your business registration number"
        value={form.regNumber}
        onChangeText={setField("regNumber")}
        error={errors.regNumber}
      />
      <AppTextInput
        label="Physical Address"
        placeholder="Enter your physical address"
        value={form.address}
        onChangeText={setField("address")}
        error={errors.address}
      />
      <AppTextInput
        label="City"
        placeholder="Enter your city"
        value={form.city}
        onChangeText={setField("city")}
        error={errors.city}
      />
      <AppTextInput
        label="Province"
        placeholder="Enter your province"
        value={form.province}
        onChangeText={setField("province")}
        error={errors.province}
      />
      <AppTextInput
        label="Services offered"
        placeholder="Services you offer"
        value={form.services}
        onChangeText={setField("services")}
        error={errors.services}
        multiline
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

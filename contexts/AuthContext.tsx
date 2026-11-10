import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { recordRegisteredUser, type UserRole } from "@/lib/adminAndFeedback";
import { revokeSessionOnServerBestEffort, supabase } from "@/lib/supabase";
import { clearSupabaseAuthStorage } from "@/lib/supabase-auth-storage";

const GUEST_STORAGE_KEY = "tara:guest_mode_active";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  userRole: UserRole;
  isAdmin: boolean;
  isGuest: boolean;
  isPasswordRecovery: boolean;
  loginAsGuest: () => Promise<void>;
  logoutGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  markPasswordRecovery: () => void;
  clearPasswordRecovery: () => void;
  setUserRole: (role: UserRole) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  userRole: "user",
  isAdmin: false,
  isGuest: false,
  isPasswordRecovery: false,
  loginAsGuest: async () => {},
  logoutGuest: async () => {},
  signOut: async () => {},
  markPasswordRecovery: () => {},
  clearPasswordRecovery: () => {},
  setUserRole: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRoleState] = useState<UserRole>("user");
  const [isGuest, setIsGuestState] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const syncRoleFromSession = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      const guestActive = await AsyncStorage.getItem(GUEST_STORAGE_KEY);
      if (guestActive === "true") {
        setIsGuestState(true);
        setUserRoleState("guest");
      } else {
        setIsGuestState(false);
        setUserRoleState("guest");
      }
      return;
    }

    // Authenticated user exists -> not in guest mode
    setIsGuestState(false);
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY).catch(() => {});

    const userEmail = currentSession.user.email?.toLowerCase().trim();
    const initialAdminEmail = process.env.EXPO_PUBLIC_INITIAL_ADMIN_EMAIL?.toLowerCase().trim();
    const fullName =
      (currentSession.user.user_metadata?.full_name as string | undefined) ||
      (currentSession.user.user_metadata?.name as string | undefined) ||
      userEmail?.split("@")[0] ||
      "Registered User";

    // 1. Check if user matches designated initial admin email from env
    if (initialAdminEmail && userEmail === initialAdminEmail) {
      setUserRoleState("admin");
      await AsyncStorage.setItem(`tara:user:role:${currentSession.user.id}`, "admin").catch(() => {});
      void recordRegisteredUser({
        id: currentSession.user.id,
        email: userEmail,
        fullName,
        role: "admin",
        joinedAt: currentSession.user.created_at,
      });
      return;
    }

    // 2. Query Supabase profiles table for live role assignment
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentSession.user.id)
        .maybeSingle();

      if (profile?.role === "admin" || profile?.role === "user" || profile?.role === "guest") {
        setUserRoleState(profile.role);
        await AsyncStorage.setItem(`tara:user:role:${currentSession.user.id}`, profile.role).catch(() => {});
        if (userEmail) {
          void recordRegisteredUser({
            id: currentSession.user.id,
            email: userEmail,
            fullName,
            role: profile.role,
            joinedAt: currentSession.user.created_at,
          });
        }
        return;
      } else if (!profile && currentSession.user.id && userEmail) {
        // Ensure profile record exists in public.profiles so administrator can manage it
        void recordRegisteredUser({
          id: currentSession.user.id,
          email: userEmail,
          fullName,
          role: "user",
          joinedAt: currentSession.user.created_at,
        });
      }
    } catch {}

    // 3. Fallback to local cached role or user metadata
    const metaRole = currentSession.user.user_metadata?.role as string | undefined;
    const localRole = await AsyncStorage.getItem(`tara:user:role:${currentSession.user.id}`);

    if (localRole === "admin" || localRole === "guest" || localRole === "user") {
      setUserRoleState(localRole);
    } else if (metaRole === "admin" || metaRole === "university_admin") {
      setUserRoleState("admin");
    } else if (metaRole === "guest") {
      setUserRoleState("guest");
    } else {
      setUserRoleState("user");
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
      setSession(s);
      void syncRoleFromSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [syncRoleFromSession]);

  const markPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(true);
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const loginAsGuest = useCallback(async () => {
    await AsyncStorage.setItem(GUEST_STORAGE_KEY, "true").catch(() => {});
    setIsGuestState(true);
    setUserRoleState("guest");
  }, []);

  const logoutGuest = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY).catch(() => {});
    setIsGuestState(false);
    setUserRoleState("user");
  }, []);

  const signOut = useCallback(async () => {
    const accessToken = session?.access_token;

    try {
      supabase.auth.stopAutoRefresh();
    } catch {}

    // Clear persisted storage BEFORE GoTrue reads it so an expired token
    // or reset socket can never block or crash local sign-out.
    await clearSupabaseAuthStorage();
    await AsyncStorage.removeItem(GUEST_STORAGE_KEY).catch(() => {});

    setSession(null);
    setIsGuestState(false);
    setIsPasswordRecovery(false);
    setUserRoleState("guest");

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Local state and storage are already cleared
    }

    // Ensure storage stays wiped even if an in-flight refresh finished concurrently
    await clearSupabaseAuthStorage();

    // Best-effort server token revocation in background (never throws)
    void revokeSessionOnServerBestEffort(accessToken);
  }, [session?.access_token]);

  const setUserRole = useCallback(
    async (role: UserRole) => {
      setUserRoleState(role);
      if (role === "guest") {
        setIsGuestState(true);
        await AsyncStorage.setItem(GUEST_STORAGE_KEY, "true").catch(() => {});
      } else {
        setIsGuestState(false);
        await AsyncStorage.removeItem(GUEST_STORAGE_KEY).catch(() => {});
      }

      if (session?.user) {
        await AsyncStorage.setItem(`tara:user:role:${session.user.id}`, role).catch(() => {});
        try {
          await supabase.auth.updateUser({
            data: { role },
          });
        } catch {
          // Keep local assignment if offline
        }
      }
    },
    [session?.user]
  );

  const isAdmin = useMemo(() => userRole === "admin", [userRole]);

  const value = useMemo(
    () => ({
      session,
      loading,
      userRole,
      isAdmin,
      isGuest,
      isPasswordRecovery,
      loginAsGuest,
      logoutGuest,
      signOut,
      markPasswordRecovery,
      clearPasswordRecovery,
      setUserRole,
    }),
    [
      session,
      loading,
      userRole,
      isAdmin,
      isGuest,
      isPasswordRecovery,
      loginAsGuest,
      logoutGuest,
      signOut,
      markPasswordRecovery,
      clearPasswordRecovery,
      setUserRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

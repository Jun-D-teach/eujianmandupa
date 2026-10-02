import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  EVENT_PERLU_LOGIN,
  gasCall,
  hapusSesiToken,
  hapusUser,
  muatUser,
  simpanSesiToken,
  simpanUser,
  type UserGas,
} from "@/lib/api";

type AuthContext = {
  user: UserGas | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (username: string, password: string) => Promise<UserGas>;
  signOut: () => void;
};

const Ctx = createContext<AuthContext | null>(null);

/**
 * Auth UjianAman — tanpa penyedia auth eksternal (Convex Auth dilepas).
 * Login dicocokkan ke tabel "pengguna" di database MySQL (dikelola admin),
 * sesi disimpan di LocalStorage perangkat.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserGas | null>(() => muatUser());
  const [isLoading, setIsLoading] = useState(false);

  // Sinkronkan antar-tab (mis. logout di tab lain).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ujianaman:user") setUser(muatUser());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Server menolak karena sesi kedaluwarsa/tidak sah → logout paksa.
  useEffect(() => {
    const onPerluLogin = () => {
      hapusUser();
      setUser(null);
    };
    window.addEventListener(EVENT_PERLU_LOGIN, onPerluLogin);
    return () => window.removeEventListener(EVENT_PERLU_LOGIN, onPerluLogin);
  }, []);

  const signIn = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await gasCall<{ user: UserGas; sesi?: string }>(
        "login",
        {
          username,
          password,
        },
        45000,
      );
      if (!res.sesi) {
        throw new Error(
          "Server tidak mengembalikan sesi login. Pastikan folder api ter-upload dan versi terbaru.",
        );
      }
      simpanSesiToken(res.sesi ?? "");
      simpanUser(res.user);
      setUser(res.user);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = () => {
    hapusSesiToken();
    hapusUser();
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        signIn,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>.");
  return ctx;
}

import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const users = [
          { id: "1", email: process.env.USER_1_EMAIL!, password: process.env.USER_1_PASSWORD!, name: "Esandu" },
          { id: "2", email: process.env.USER_2_EMAIL!, password: process.env.USER_2_PASSWORD!, name: "Teammate" },
        ];

        const user = users.find(
          (u) => u.email === credentials.email && u.password === credentials.password
        );

        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

import { prisma } from '@/lib/prisma'
import { compare } from 'bcrypt'
import CredentialsProvider from 'next-auth/providers/credentials'


export const NEXT_AUTH_CONFIG = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Sign in',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

         const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })
        if (!user) {
          return null
        }

        let isPasswordValid =  await compare(credentials.password, user.password)
        if (!isPasswordValid) {
          return null
        }


        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    })
  ], callbacks: {
     jwt: async ({ token, user }: any) => {
      console.log('JWT Callback', { token, user })
      if (user) {
        const u = user as unknown as any
        return {
          ...token,
          id: u.id,
          role: u.role
        }
      }
      return token
    },
session: async ({ session, token }: any) => {      
  console.log('Session Callback', { session, token })
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id,
          role:token.role
        }
      }
  }
}
}


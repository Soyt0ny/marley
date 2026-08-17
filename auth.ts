import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

import { adminUsers } from '@/db/schema'
import { authConfig } from '@/lib/auth/config'
import { db } from '@/lib/db'

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

/**
 * Compared against when no account matches, so a wrong email and a wrong password take the
 * same time to reject and the login form cannot be used to enumerate accounts.
 */
const TIMING_EQUALIZER_HASH = bcrypt.hashSync('timing-equalizer', 10)

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials)
        if (!parsed.success) return null

        const email = parsed.data.email.toLowerCase()
        const [user] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.email, email))
          .limit(1)

        if (!user) {
          await bcrypt.compare(parsed.data.password, TIMING_EQUALIZER_HASH)
          return null
        }

        const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!passwordMatches) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
})

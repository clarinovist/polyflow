import { Role } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            role: Role              // active role (login-selected)
            roles: Role[]           // ALL assigned roles
            id: string
            isSuperAdmin?: boolean
            allowedResources?: string[]
        } & DefaultSession["user"]
    }

    interface User {
        role: Role
        roles?: Role[]
        isSuperAdmin?: boolean
        allowedResources?: string[]
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        role?: Role
        roles?: Role[]
        id?: string
        isSuperAdmin?: boolean
        allowedResources?: string[]
        rememberMe?: boolean
        lastActive?: number
    }
}


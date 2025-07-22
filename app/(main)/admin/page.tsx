"use client"

import { useEffect, useState } from "react"
import { useSession, authClient as auth } from "@/lib/auth/auth-client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Ban2 from "@/components/icons/ban-2"
import Calendar2 from "@/components/icons/calendar-2"
import Gear2 from "@/components/icons/gear-2"
import CircleWarning2 from "@/components/icons/circle-warning-2"
import Globe2 from "@/components/icons/globe-2"
import DoorOpen from "@/components/icons/door-open"
import Envelope2 from "@/components/icons/envelope-2"
import CirclePlus from "@/components/icons/circle-plus"
import Refresh2 from "@/components/icons/refresh-2"
import Magnifier2 from "@/components/icons/magnifier-2"
import ShieldCheck from "@/components/icons/shield-check"
import Trash2 from "@/components/icons/trash-2"
import CircleUser from "@/components/icons/circle-user"
import UserGroup from "@/components/icons/user-group"
import Crown from "@/components/icons/crown"
import { getAllDomainsForAdmin, getDomainEmailAddressesForAdmin } from "@/app/actions/primary"
import { addFeatureFlag, removeFeatureFlag, getUserFeatureFlags } from "@/app/actions/feature-flags"


// Auth client with admin functions is imported above

interface User {
  id: string
  name: string | null
  email: string
  role?: string
  createdAt: Date
  banned?: boolean
  banReason?: string | null
  banExpires?: Date | null
}

interface Domain {
  id: string
  domain: string
  status: string
  canReceiveEmails: boolean
  hasMxRecords: boolean
  domainProvider: string | null
  providerConfidence: string | null
  lastDnsCheck: Date | null
  lastSesCheck: Date | null
  isCatchAllEnabled: boolean
  createdAt: Date
  updatedAt: Date
  userId: string
  userName: string
  userEmail: string
  emailAddressCount: number
  activeEmailAddressCount: number
}

interface EmailAddress {
  id: string
  address: string
  isActive: boolean
  isReceiptRuleConfigured: boolean
  receiptRuleName: string | null
  webhookId: string | null
  webhookName: string | null
  endpointId: string | null
  endpointName: string | null
  endpointType: string | null
  createdAt: Date
  updatedAt: Date
}

export default function AdminPage() {
  const { data: session, isPending, error } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [userStats, setUserStats] = useState({ total: 0, active: 0, admin: 0 })
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" })

  // Domain management state
  const [domains, setDomains] = useState<Domain[]>([])
  const [isLoadingDomains, setIsLoadingDomains] = useState(false)
  const [domainSearchQuery, setDomainSearchQuery] = useState("")
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)
  const [domainEmailAddresses, setDomainEmailAddresses] = useState<EmailAddress[]>([])
  const [isLoadingEmailAddresses, setIsLoadingEmailAddresses] = useState(false)
  const [isEmailAddressesDialogOpen, setIsEmailAddressesDialogOpen] = useState(false)

  // Feature flag management state
  const [selectedUserForFlags, setSelectedUserForFlags] = useState<User | null>(null)
  const [isFeatureFlagDialogOpen, setIsFeatureFlagDialogOpen] = useState(false)
  const [userFeatureFlags, setUserFeatureFlags] = useState<string[]>([])
  const [isLoadingFeatureFlags, setIsLoadingFeatureFlags] = useState(false)
  const [newFeatureFlag, setNewFeatureFlag] = useState("")
  
  // Current user feature flags state
  const [currentUserFlags, setCurrentUserFlags] = useState<string[]>([])
  const [isLoadingCurrentUserFlags, setIsLoadingCurrentUserFlags] = useState(false)
  const [newCurrentUserFlag, setNewCurrentUserFlag] = useState("")

  const pageSize = 10

  useEffect(() => {
    if (!isPending) {
      setIsLoading(false)
      
      // Check if user is logged in
      if (!session) {
        router.push("/login")
        return
      }

      // Check if user has admin role
      if (session.user.role !== 'admin') {
        router.push("/mail")
        return
      }

      // Load initial data
      loadUsers()
      loadDomains()
      loadCurrentUserFlags()
    }
  }, [session, isPending, router])

  const loadUsers = async (page = 1, search = "") => {
    setIsLoadingUsers(true)
    try {
      const response = await auth.admin.listUsers({
        query: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          ...(search && {
            searchField: "email",
            searchOperator: "contains",
            searchValue: search
          }),
          sortBy: "createdAt",
          sortDirection: "desc"
        }
      })

      if (response.data) {
        const users = response.data.users || []
        const total = response.data.total || 0
        
        setUsers(users as User[])
        setTotalUsers(total)
        
        // Calculate stats
        const adminCount = users.filter((u: any) => u.role === 'admin').length
        const activeCount = users.filter((u: any) => !u.banned).length
        
        setUserStats({
          total: total,
          active: activeCount,
          admin: adminCount
        })
      }
    } catch (error) {
      console.error("Failed to load users:", error)
    } finally {
      setIsLoadingUsers(false)
    }
  }

  const handleSearch = () => {
    setCurrentPage(1)
    loadUsers(1, searchQuery)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadUsers(page, searchQuery)
  }

  const handleCreateUser = async () => {
    try {
      await auth.admin.createUser({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role as "user" | "admin"
      })
      
      setIsCreateUserOpen(false)
      setNewUser({ name: "", email: "", password: "", role: "user" })
      loadUsers(currentPage, searchQuery)
    } catch (error) {
      console.error("Failed to create user:", error)
    }
  }

  const handleBanUser = async (userId: string) => {
    try {
      await auth.admin.banUser({
        userId,
        banReason: "Banned by admin"
      })
      loadUsers(currentPage, searchQuery)
    } catch (error) {
      console.error("Failed to ban user:", error)
    }
  }

  const handleUnbanUser = async (userId: string) => {
    try {
      await auth.admin.unbanUser({ userId })
      loadUsers(currentPage, searchQuery)
    } catch (error) {
      console.error("Failed to unban user:", error)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      await auth.admin.removeUser({ userId })
      loadUsers(currentPage, searchQuery)
    } catch (error) {
      console.error("Failed to delete user:", error)
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await auth.admin.setRole({ userId, role: newRole as "user" | "admin" })
      loadUsers(currentPage, searchQuery)
    } catch (error) {
      console.error("Failed to update role:", error)
    }
  }

  // Feature flag management functions
  const handleManageFeatureFlags = async (user: User) => {
    setSelectedUserForFlags(user)
    setIsFeatureFlagDialogOpen(true)
    setIsLoadingFeatureFlags(true)
    
    try {
      const response = await getUserFeatureFlags(user.id)
      if (response.success) {
        setUserFeatureFlags(response.flags || [])
      } else {
        console.error("Failed to load feature flags:", response.error)
        setUserFeatureFlags([])
      }
    } catch (error) {
      console.error("Failed to load feature flags:", error)
      setUserFeatureFlags([])
    } finally {
      setIsLoadingFeatureFlags(false)
    }
  }

  const handleAddFeatureFlag = async () => {
    if (!selectedUserForFlags || !newFeatureFlag.trim()) return
    
    try {
      const response = await addFeatureFlag(selectedUserForFlags.id, newFeatureFlag.trim())
      if (response.success) {
        setUserFeatureFlags(response.flags || [])
        setNewFeatureFlag("")
      } else {
        console.error("Failed to add feature flag:", response.error)
      }
    } catch (error) {
      console.error("Failed to add feature flag:", error)
    }
  }

  const handleRemoveFeatureFlag = async (flagName: string) => {
    if (!selectedUserForFlags) return
    
    try {
      const response = await removeFeatureFlag(selectedUserForFlags.id, flagName)
      if (response.success) {
        setUserFeatureFlags(response.flags || [])
      } else {
        console.error("Failed to remove feature flag:", response.error)
      }
    } catch (error) {
      console.error("Failed to remove feature flag:", error)
    }
  }

  // Current user feature flag management functions
  const loadCurrentUserFlags = async () => {
    if (!session?.user?.id) return
    
    setIsLoadingCurrentUserFlags(true)
    try {
      const response = await getUserFeatureFlags() // No userId means current user
      if (response.success) {
        setCurrentUserFlags(response.flags || [])
      } else {
        console.error("Failed to load current user feature flags:", response.error)
        setCurrentUserFlags([])
      }
    } catch (error) {
      console.error("Failed to load current user feature flags:", error)
      setCurrentUserFlags([])
    } finally {
      setIsLoadingCurrentUserFlags(false)
    }
  }

  const handleAddCurrentUserFeatureFlag = async () => {
    if (!session?.user?.id || !newCurrentUserFlag.trim()) return
    
    try {
      const response = await addFeatureFlag(session.user.id, newCurrentUserFlag.trim())
      if (response.success) {
        setCurrentUserFlags(response.flags || [])
        setNewCurrentUserFlag("")
      } else {
        console.error("Failed to add current user feature flag:", response.error)
      }
    } catch (error) {
      console.error("Failed to add current user feature flag:", error)
    }
  }

  const handleRemoveCurrentUserFeatureFlag = async (flagName: string) => {
    if (!session?.user?.id) return
    
    try {
      const response = await removeFeatureFlag(session.user.id, flagName)
      if (response.success) {
        setCurrentUserFlags(response.flags || [])
      } else {
        console.error("Failed to remove current user feature flag:", response.error)
      }
    } catch (error) {
      console.error("Failed to remove current user feature flag:", error)
    }
  }

  // Domain management functions
  const loadDomains = async () => {
    setIsLoadingDomains(true)
    try {
      const response = await getAllDomainsForAdmin()
      
      if ('error' in response) {
        console.error("Failed to load domains:", response.error)
      } else {
        setDomains(response.domains)
      }
    } catch (error) {
      console.error("Failed to load domains:", error)
    } finally {
      setIsLoadingDomains(false)
    }
  }

  const handleDomainSearch = () => {
    // Filter domains based on search query
    // This is client-side filtering since we're loading all domains
  }

  const handleViewDomainEmailAddresses = async (domain: Domain) => {
    setSelectedDomain(domain)
    setIsLoadingEmailAddresses(true)
    setIsEmailAddressesDialogOpen(true)
    
    try {
      const response = await getDomainEmailAddressesForAdmin(domain.id)
      
      if ('error' in response) {
        console.error("Failed to load email addresses:", response.error)
        setDomainEmailAddresses([])
      } else {
        setDomainEmailAddresses(response.emailAddresses)
      }
    } catch (error) {
      console.error("Failed to load email addresses:", error)
      setDomainEmailAddresses([])
    } finally {
      setIsLoadingEmailAddresses(false)
    }
  }

  // Filter domains based on search query
  const filteredDomains = domains.filter(domain => 
    domain.domain.toLowerCase().includes(domainSearchQuery.toLowerCase()) ||
    domain.userName.toLowerCase().includes(domainSearchQuery.toLowerCase()) ||
    domain.userEmail.toLowerCase().includes(domainSearchQuery.toLowerCase())
  )

  // Show loading state
  if (isPending || isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <Refresh2 className="h-6 w-6 animate-spin" />
            <span>Loading admin panel...</span>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <CircleWarning2 className="h-4 w-4" />
              <span>Error loading admin panel: {error.message}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Don't render anything if not admin (redirect should handle this)
  if (!session || session.user.role !== 'admin') {
    return null
  }

  const totalPages = Math.ceil(totalUsers / pageSize)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-8 w-8" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">
            Administrative controls and system management
          </p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          Administrator
        </Badge>
      </div>

      {/* Admin Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserGroup className="h-4 w-4" />
            User Management
          </TabsTrigger>
          <TabsTrigger value="domains" className="flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            Domain Management
          </TabsTrigger>
          <TabsTrigger value="development" className="flex items-center gap-2">
            <Gear2 className="h-4 w-4" />
            Development
          </TabsTrigger>
        </TabsList>

        {/* User Management Tab */}
        <TabsContent value="users" className="space-y-6">
          {/* User Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userStats.total}</div>
                <p className="text-xs text-muted-foreground">
                  Registered users
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userStats.active}</div>
                <p className="text-xs text-muted-foreground">
                  Not banned
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Admin Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userStats.admin}</div>
                <p className="text-xs text-muted-foreground">
                  Administrator role
                </p>
              </CardContent>
            </Card>
          </div>

          {/* User Management Controls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>
                    Manage user accounts, roles, and permissions
                  </CardDescription>
                </div>
                <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <CirclePlus className="h-4 w-4" />
                      Create User
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New User</DialogTitle>
                      <DialogDescription>
                        Add a new user to the system
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          value={newUser.name}
                          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                          placeholder="Enter user's name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                          placeholder="Enter user's email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="Enter password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="secondary" onClick={() => setIsCreateUserOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateUser}>Create User</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Search users by email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <Button onClick={handleSearch} variant="secondary">
                  <Magnifier2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Users Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingUsers ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Refresh2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CircleUser className="h-4 w-4" />
                              <div>
                                <div className="font-medium">{user.name || "No name"}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                              </div>
                            </div>
                          </TableCell>
                                                     <TableCell>
                             <Select
                               value={user.role || "user"}
                               onValueChange={(value) => handleRoleChange(user.id, value)}
                               disabled={user.id === session?.user.id}
                             >
                               <SelectTrigger className="w-24">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="user">User</SelectItem>
                                 <SelectItem value="admin">Admin</SelectItem>
                               </SelectContent>
                             </Select>
                           </TableCell>
                           <TableCell>
                             {user.banned ? (
                               <Badge variant="destructive">Banned</Badge>
                             ) : (
                               <Badge variant="default">Active</Badge>
                             )}
                           </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar2 className="h-3 w-3" />
                              {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                          </TableCell>
                                                     <TableCell>
                             <div className="flex items-center gap-1">
                               {user.id === session?.user.id ? (
                                 <span className="text-xs text-muted-foreground px-2">Current User</span>
                               ) : (
                                 <>
                                   <Button
                                     size="sm"
                                     variant="secondary"
                                     onClick={() => handleManageFeatureFlags(user)}
                                     title="Manage feature flags"
                                   >
                                     <Crown className="h-3 w-3" />
                                   </Button>
                                   {user.banned ? (
                                     <Button
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => handleUnbanUser(user.id)}
                                       title="Unban user"
                                     >
                                       <DoorOpen className="h-3 w-3" />
                                     </Button>
                                   ) : (
                                     <Button
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => handleBanUser(user.id)}
                                       title="Ban user"
                                     >
                                       <Ban2 className="h-3 w-3" />
                                     </Button>
                                   )}
                                   <Button
                                     size="sm"
                                     variant="secondary"
                                     onClick={() => handleDeleteUser(user.id)}
                                     title="Delete user"
                                   >
                                     <Trash2 className="h-3 w-3" />
                                   </Button>
                                 </>
                               )}
                             </div>
                           </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers} users
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Domain Management Tab */}
        <TabsContent value="domains" className="space-y-6">
          {/* Domain Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{domains.length}</div>
                <p className="text-xs text-muted-foreground">
                  All domains
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Verified Domains</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{domains.filter(d => d.status === 'verified').length}</div>
                <p className="text-xs text-muted-foreground">
                  Ready to receive emails
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Email Addresses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{domains.reduce((sum, d) => sum + d.emailAddressCount, 0)}</div>
                <p className="text-xs text-muted-foreground">
                  Total email addresses
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Addresses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{domains.reduce((sum, d) => sum + d.activeEmailAddressCount, 0)}</div>
                <p className="text-xs text-muted-foreground">
                  Active email addresses
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Domain Management Controls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Domain Management</CardTitle>
                  <CardDescription>
                    View and manage all domains across all users
                  </CardDescription>
                </div>
                <Button onClick={loadDomains} variant="secondary" className="flex items-center gap-2">
                  <Refresh2 className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Search domains, users, or email addresses..."
                    value={domainSearchQuery}
                    onChange={(e) => setDomainSearchQuery(e.target.value)}
                  />
                </div>
                <Button onClick={handleDomainSearch} variant="secondary">
                  <Magnifier2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Domains Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Email Addresses</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingDomains ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <Refresh2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredDomains.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No domains found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDomains.map((domain) => (
                        <TableRow key={domain.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Globe2 className="h-4 w-4" />
                              <div>
                                <div className="font-medium">{domain.domain}</div>
                                {domain.isCatchAllEnabled && (
                                  <div className="text-xs text-blue-600">Catch-all enabled</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{domain.userName}</div>
                              <div className="text-sm text-muted-foreground">{domain.userEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                domain.status === 'verified' ? 'default' : 
                                domain.status === 'pending' ? 'secondary' : 
                                'destructive'
                              }
                            >
                              {domain.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{domain.emailAddressCount} total</div>
                              <div className="text-muted-foreground">{domain.activeEmailAddressCount} active</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {domain.domainProvider || 'Unknown'}
                              {domain.providerConfidence && (
                                <div className="text-xs text-muted-foreground">
                                  {domain.providerConfidence} confidence
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar2 className="h-3 w-3" />
                              {new Date(domain.createdAt).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleViewDomainEmailAddresses(domain)}
                                title="View email addresses"
                              >
                                <Envelope2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Email Addresses Dialog */}
          <Dialog open={isEmailAddressesDialogOpen} onOpenChange={setIsEmailAddressesDialogOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Email Addresses for {selectedDomain?.domain}</DialogTitle>
                <DialogDescription>
                  Owned by {selectedDomain?.userName} ({selectedDomain?.userEmail})
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-96 overflow-y-auto">
                {isLoadingEmailAddresses ? (
                  <div className="flex items-center justify-center py-8">
                    <Refresh2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : domainEmailAddresses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No email addresses found for this domain
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email Address</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Configuration</TableHead>
                        <TableHead>Endpoint/Webhook</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domainEmailAddresses.map((email) => (
                        <TableRow key={email.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Envelope2 className="h-4 w-4" />
                              <span className="font-medium">{email.address}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={email.isActive ? 'default' : 'secondary'}>
                              {email.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {email.isReceiptRuleConfigured ? (
                                <div>
                                  <div className="text-green-600">✓ Configured</div>
                                  {email.receiptRuleName && (
                                    <div className="text-xs text-muted-foreground">
                                      Rule: {email.receiptRuleName}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-yellow-600">⚠ Not configured</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {email.endpointId ? (
                                <div>
                                  <div className="font-medium">{email.endpointName || 'Unnamed Endpoint'}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Type: {email.endpointType}
                                  </div>
                                </div>
                              ) : email.webhookId ? (
                                <div>
                                  <div className="font-medium">{email.webhookName || 'Unnamed Webhook'}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Legacy webhook
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground">No endpoint assigned</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar2 className="h-3 w-3" />
                              {new Date(email.createdAt).toLocaleDateString()}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Feature Flags Dialog */}
          <Dialog open={isFeatureFlagDialogOpen} onOpenChange={setIsFeatureFlagDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-500" />
                  Feature Flags for {selectedUserForFlags?.name}
                </DialogTitle>
                <DialogDescription>
                  Manage feature flags for {selectedUserForFlags?.email}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Add new feature flag */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter feature flag name (e.g., vip, beta, advanced)"
                    value={newFeatureFlag}
                    onChange={(e) => setNewFeatureFlag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFeatureFlag()}
                  />
                  <Button onClick={handleAddFeatureFlag} disabled={!newFeatureFlag.trim()}>
                    <CirclePlus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Current feature flags */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Current Feature Flags</Label>
                  {isLoadingFeatureFlags ? (
                    <div className="flex items-center justify-center py-8">
                      <Refresh2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : userFeatureFlags.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No feature flags assigned to this user
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userFeatureFlags.map((flag) => (
                        <div key={flag} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <Crown className="h-4 w-4 text-yellow-500" />
                            <span className="font-medium">{flag}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRemoveFeatureFlag(flag)}
                            title="Remove feature flag"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Common feature flags for quick access */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Quick Add Common Flags</Label>
                  <div className="flex flex-wrap gap-2">
                    {['vip', 'beta', 'advanced', 'admin', 'premium'].map((commonFlag) => (
                      <Button
                        key={commonFlag}
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!selectedUserForFlags || userFeatureFlags.includes(commonFlag)) return
                          try {
                            const response = await addFeatureFlag(selectedUserForFlags.id, commonFlag)
                            if (response.success) {
                              setUserFeatureFlags(response.flags || [])
                            }
                          } catch (error) {
                            console.error("Failed to add feature flag:", error)
                          }
                        }}
                        disabled={userFeatureFlags.includes(commonFlag)}
                        className="text-xs"
                      >
                        {commonFlag}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Development Tab */}
        <TabsContent value="development" className="space-y-6">
          {/* Current User Feature Flags */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-yellow-500" />
                    My Feature Flags
                  </CardTitle>
                  <CardDescription>
                    Manage your own feature flags for testing purposes
                  </CardDescription>
                </div>
                <Button onClick={loadCurrentUserFlags} variant="secondary" className="flex items-center gap-2">
                  <Refresh2 className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new feature flag for current user */}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter feature flag name (e.g., vip, beta, advanced)"
                  value={newCurrentUserFlag}
                  onChange={(e) => setNewCurrentUserFlag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCurrentUserFeatureFlag()}
                />
                <Button onClick={handleAddCurrentUserFeatureFlag} disabled={!newCurrentUserFlag.trim()}>
                  <CirclePlus className="h-4 w-4" />
                </Button>
              </div>

              {/* Current feature flags */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Active Feature Flags</Label>
                {isLoadingCurrentUserFlags ? (
                  <div className="flex items-center justify-center py-8">
                    <Refresh2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : currentUserFlags.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No feature flags assigned to your account
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {currentUserFlags.map((flag) => (
                      <div key={flag} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">{flag}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRemoveCurrentUserFeatureFlag(flag)}
                          title="Remove feature flag"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick add common flags */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Quick Add Common Flags</Label>
                <div className="flex flex-wrap gap-2">
                  {['vip', 'beta', 'advanced', 'premium', 'debug'].map((commonFlag) => (
                    <Button
                      key={commonFlag}
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!session?.user?.id || currentUserFlags.includes(commonFlag)) return
                        try {
                          const response = await addFeatureFlag(session.user.id, commonFlag)
                          if (response.success) {
                            setCurrentUserFlags(response.flags || [])
                          }
                        } catch (error) {
                          console.error("Failed to add feature flag:", error)
                        }
                      }}
                      disabled={currentUserFlags.includes(commonFlag)}
                      className="text-xs"
                    >
                      {commonFlag}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Info about feature flags */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <CircleWarning2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">About Feature Flags</p>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      Feature flags control access to experimental features and UI elements. 
                      The <strong>vip</strong> flag enables the VIP tab in navigation. 
                      Changes take effect immediately without requiring a page refresh.
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 mt-2 text-xs">
                      <strong>Security:</strong> Only admins can modify other users' feature flags. 
                      Regular users can only manage their own flags for testing.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 
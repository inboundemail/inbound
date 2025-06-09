"use client"

import { useEffect, useState } from "react"
import { useSession, authClient as auth } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ShieldCheckIcon, 
  UsersIcon, 
  SettingsIcon,
  AlertTriangleIcon,
  LoaderIcon,
  SearchIcon,
  PlusIcon,
  BanIcon,
  UnlockIcon,
  TrashIcon,
  UserIcon,
  MailIcon,
  CalendarIcon
} from "lucide-react"
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

interface UserListResponse {
  users: User[]
  total: number
  limit?: number
  offset?: number
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
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" })

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
        router.push("/dashboard")
        return
      }

      // Load initial data
      loadUsers()
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

  // Show loading state
  if (isPending || isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <LoaderIcon className="h-6 w-6 animate-spin" />
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
              <AlertTriangleIcon className="h-4 w-4" />
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
            <ShieldCheckIcon className="h-8 w-8" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">
            Administrative controls and system management
          </p>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1">
          <ShieldCheckIcon className="h-3 w-3" />
          Administrator
        </Badge>
      </div>

      {/* Admin Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4" />
            User Management
          </TabsTrigger>
          <TabsTrigger value="development" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
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
                      <PlusIcon className="h-4 w-4" />
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
                    <div className="space-y-4">
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
                  <SearchIcon className="h-4 w-4" />
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
                          <LoaderIcon className="h-6 w-6 animate-spin mx-auto" />
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
                              <UserIcon className="h-4 w-4" />
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
                              <CalendarIcon className="h-3 w-3" />
                              {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                          </TableCell>
                                                     <TableCell>
                             <div className="flex items-center gap-1">
                               {user.id === session?.user.id ? (
                                 <span className="text-xs text-muted-foreground px-2">Current User</span>
                               ) : (
                                 <>
                                   {user.banned ? (
                                     <Button
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => handleUnbanUser(user.id)}
                                       title="Unban user"
                                     >
                                       <UnlockIcon className="h-3 w-3" />
                                     </Button>
                                   ) : (
                                     <Button
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => handleBanUser(user.id)}
                                       title="Ban user"
                                     >
                                       <BanIcon className="h-3 w-3" />
                                     </Button>
                                   )}
                                   <Button
                                     size="sm"
                                     variant="secondary"
                                     onClick={() => handleDeleteUser(user.id)}
                                     title="Delete user"
                                   >
                                     <TrashIcon className="h-3 w-3" />
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

        {/* Development Tab */}
        <TabsContent value="development" className="space-y-6">
        </TabsContent>
      </Tabs>
    </div>
  )
} 
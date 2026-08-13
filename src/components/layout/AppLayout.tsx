import { toast } from "sonner";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { 
  MessageSquare, 
  Grid, 
  Settings, 
  LogOut,
  Menu,
  X,
  Video,
  Clapperboard,
  Globe,
  Search,
  MoreHorizontal,
  Pencil,
  Trash,
  Sun,
  Moon,
  History
} from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { getMe, logout, listChats, createChat, renameChat, deleteChat } from "@/lib/auth.functions";
import { useTheme } from "@/components/ThemeProvider";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const routerState = useRouterState();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const fnGetMe = useServerFn(getMe);
  const fnLogout = useServerFn(logout);
  const fnListChats = useServerFn(listChats);
  const fnCreateChat = useServerFn(createChat);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string | null; email: string } | null>(null);
  const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fnRenameChat = useServerFn(renameChat);
  const fnDeleteChat = useServerFn(deleteChat);

  const isLoginPage = routerState.location.pathname === "/login";
  const isComposerPage = routerState.location.pathname === "/composer";
  const isSeriesPage = routerState.location.pathname.startsWith("/series");

  useEffect(() => {
    if (isLoginPage || isComposerPage || isSeriesPage) return;
    
    async function load() {
      try {
        const res = await fnGetMe();
        if (!res.ok) {
          navigate({ to: "/login" });
          return;
        }
        setUser(res.user as any);

        const chatRes = await fnListChats();
        if (chatRes.ok) {
          setChats(chatRes.chats as any[]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [routerState.location.pathname]);

  async function handleLogout() {
    await fnLogout();
    try {
      localStorage.removeItem("projectId");
    } catch {
      /* ignore */
    }
    navigate({ to: "/login" });
  }

  async function handleNewChat() {
    try {
      const res = await fnCreateChat();
      if (!res) throw new Error("Server did not return a response");
      
      if (res.ok) {
        const chatRes = await fnListChats();
        if (chatRes.ok) setChats(chatRes.chats as any[]);
        navigate({ to: "/", search: { chatId: res.chatId } });
        setIsMobileOpen(false); // Close mobile sidebar if open
      } else {
        toast.error(res.error || "Failed to create chat");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleRenameChat(id: string, currentTitle: string) {
    const newTitle = window.prompt("Rename chat:", currentTitle);
    if (!newTitle || newTitle === currentTitle) return;
    try {
      const res = await fnRenameChat({ data: { chatId: id, title: newTitle } });
      if (res.ok) {
        setChats(chats.map(c => c.id === id ? { ...c, title: newTitle } : c));
        toast.success("Chat renamed");
      } else {
        toast.error(res.error || "Failed to rename chat");
      }
    } catch(e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDeleteChat(id: string) {
    if (!window.confirm("Are you sure you want to delete this chat?")) return;
    try {
      const res = await fnDeleteChat({ data: { chatId: id } });
      if (res.ok) {
        setChats(chats.filter(c => c.id !== id));
        if (routerState.location.search?.chatId === id) {
          navigate({ to: "/" });
        }
        toast.success("Chat deleted");
      } else {
        toast.error(res.error || "Failed to delete chat");
      }
    } catch(e) {
      toast.error((e as Error).message);
    }
  }

  if (isLoginPage || isComposerPage || isSeriesPage) {
    return <>{children}</>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#f9f9f9] dark:bg-card/50 border-r border-border/40 w-64 text-[14px]">
      {/* Top Header */}
      <div className="p-4 flex items-center gap-2 font-semibold">
        <Globe className="h-5 w-5 text-primary" />
        IzentSocial
      </div>

      {/* Primary Actions */}
      <div className="px-3 pb-2 space-y-1">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-left font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
          onClick={handleNewChat}
        >
          <MessageSquare className="mr-3 h-4 w-4" />
          New Chat
        </Button>
        <Link to="/connectors">
          <Button 
            variant="ghost" 
            onClick={() => setIsMobileOpen(false)}
            className={`w-full justify-start text-left font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${routerState.location.pathname === '/connectors' ? 'bg-black/5 dark:bg-white/5' : ''}`}
          >
            <Grid className="mr-3 h-4 w-4" />
            Connectors (Apps)
          </Button>
        </Link>
        <Link to="/composer">
          <Button 
            variant="ghost" 
            onClick={() => setIsMobileOpen(false)}
            className={`w-full justify-start text-left font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${routerState.location.pathname === '/composer' ? 'bg-black/5 dark:bg-white/5' : ''}`}
          >
            <Video className="mr-3 h-4 w-4" />
            Video Editor
          </Button>
        </Link>
        <Link to="/series">
          <Button 
            variant="ghost" 
            onClick={() => setIsMobileOpen(false)}
            className={`w-full justify-start text-left font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${routerState.location.pathname.startsWith('/series') ? 'bg-black/5 dark:bg-white/5' : ''}`}
          >
            <Clapperboard className="mr-3 h-4 w-4" />
            Faceless Series
          </Button>
        </Link>
        <Link to="/history">
          <Button 
            variant="ghost" 
            onClick={() => setIsMobileOpen(false)}
            className={`w-full justify-start text-left font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${routerState.location.pathname === '/history' ? 'bg-black/5 dark:bg-white/5' : ''}`}
          >
            <History className="mr-3 h-4 w-4" />
            Post History
          </Button>
        </Link>
      </div>

      {/* Chat History */}
      <div className="flex-1 flex flex-col min-h-0 px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-muted-foreground px-2">Recents</div>
        </div>
        <div className="px-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input 
            placeholder="Search chats..." 
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            className="h-8 pl-8 text-xs bg-black/5 dark:bg-white/5 border-transparent focus-visible:ring-1 focus-visible:ring-primary/50"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {chats.filter(c => c.title.toLowerCase().includes(chatSearch.toLowerCase())).map(c => (
            <div key={c.id} className="relative group flex items-center">
              <Link to="/" search={{ chatId: c.id }} className="flex-1 min-w-0">
                <Button variant="ghost" className={`w-full justify-start text-left font-normal rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 truncate pr-8 ${routerState.location.search?.chatId === c.id ? 'bg-black/5 text-foreground' : ''}`}>
                  <div className="truncate">{c.title}</div>
                </Button>
              </Link>
              
              <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-black/10 dark:hover:bg-white/10">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => handleRenameChat(c.id, c.title)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteChat(c.id)}>
                      <Trash className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Profile */}
      <div className="p-3 border-t border-border/40 space-y-1">
        <div className="flex gap-1 mb-1">
          <Button 
            variant="ghost" 
            className="flex-1 justify-start text-left font-medium text-xs rounded-lg hover:bg-black/5 dark:hover:bg-white/5 px-3"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
        <Link to="/settings">
          <Button variant="ghost" className={`w-full justify-start text-left font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${routerState.location.pathname === '/settings' ? 'bg-black/5 dark:bg-white/5' : ''}`}>
            <Settings className="mr-3 h-4 w-4" />
            Settings
          </Button>
        </Link>
        <Button variant="ghost" className="w-full justify-start text-left font-medium rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleLogout}>
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block h-full flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <div className="relative w-64 h-full shadow-2xl animate-in slide-in-from-left duration-200">
            <SidebarContent />
            <button 
              onClick={() => setIsMobileOpen(false)}
              className="absolute right-[-40px] top-4 p-2 bg-background/80 backdrop-blur rounded-full text-foreground shadow-sm"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b border-border/40 bg-background/80 backdrop-blur-md">
          <button onClick={() => setIsMobileOpen(true)} className="p-2 -ml-2 rounded-md hover:bg-accent">
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-semibold ml-2">IzentSocial</div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}


'use client';

import {
  ArrowRight,
  Check,
  ChevronsUpDown,
  Circle,
  Copy,
  Edit,
  ExternalLink,
  File,
  HelpCircle,
  Home,
  Loader2,
  Mail,
  MessageSquare,
  Moon,
  Plus,
  PlusCircle,
  Server,
  Settings,
  Share2,
  Shield,
  Sun,
  Trash,
  User,
  X,
  Workflow,
  LayoutDashboard,
  Briefcase,
  Building,
  FileText,
  LifeBuoy,
  Link as LinkIcon,
  Megaphone,
  TrendingUp,
  Calendar, // Keep Calendar from lucide
  PackageSearch, // Added PackageSearch
  MapPin, // Added MapPin
  CalendarDays, // Added CalendarDays
} from 'lucide-react';

// Define SVG components directly for Search and Logo
const SearchIconComponent = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props} // Spread additional props like className here
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const LogoIconComponent = (props: React.SVGProps<SVGSVGElement>) => (
 <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props} // Spread additional props like className here
  >
   <rect width="7" height="9" x="3" y="3" rx="1" />
   <rect width="7" height="5" x="14" y="3" rx="1" />
   <rect width="7" height="9" x="14" y="12" rx="1" />
   <rect width="7" height="5" x="3" y="16" rx="1" />
 </svg>
);


const Icons = {
  arrowRight: ArrowRight,
  check: Check,
  chevronDown: ChevronsUpDown,
  circle: Circle,
  workflow: Workflow,
  close: X,
  copy: Copy,
  edit: Edit,
  externalLink: ExternalLink,
  file: File,
  help: HelpCircle,
  home: Home,
  light: Sun,
  loader: Loader2,
  mail: Mail,
  messageSquare: MessageSquare,
  plus: Plus,
  plusCircle: PlusCircle,
  search: SearchIconComponent, // Use the SVG component
  server: Server,
  settings: Settings,
  share: Share2,
  shield: Shield,
  spinner: Loader2,
  trash: Trash,
  user: User,
  logo: LogoIconComponent, // Use the SVG component
  briefcase: Briefcase,
  building: Building,
  fileText: FileText,
  lifeBuoy: LifeBuoy,
  link: LinkIcon,
  megaphone: Megaphone,
  trendingUp: TrendingUp,
  calendar: Calendar, // Keep Calendar from lucide
  packageSearch: PackageSearch, // Added PackageSearch
  mapPin: MapPin, // Added MapPin
  calendarDays: CalendarDays, // Added CalendarDays
};

export { Icons };

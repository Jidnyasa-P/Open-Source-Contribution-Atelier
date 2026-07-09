import { AdminDashboard } from "../components/dashboard/AdminDashboard";
import { ContributorDashboard } from "../components/dashboard/ContributorDashboard";
import { useAuth } from "../features/auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "../lib/api";
import { Link } from "react-router-dom";
import { SocialShareButtons } from "../components/ui/SocialShareButtons";
import SkeletonAdminDashboard from "../components/ui/skeletons/SkeletonAdminDashboard";
import SkeletonContributorDashboard from "../components/ui/skeletons/SkeletonContributorDashboard";
import { useRef } from "react";
import { useElementSize } from "../hooks/useElementSize";
import { fetchLessonsApi, Lesson } from "../lib/lessons";
import { LessonsChart } from '../components/LessonsChart';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { useUserProgress } from "../hooks/useUserProgress";
import { useBookmarks } from "../hooks/useBookmarks";
import { BADGES } from "../constants/badges";
import {
  Award,
  Flame,
  CheckCircle2,
  Users,
  Trophy,
  ArrowRight,
  Download,
  Printer,
  Code,
  X,
  Lock,
  Bookmark,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { OnboardingTour } from "../components/ui/OnboardingTour";
import { NotesWidget } from "../components/ui/NotesWidget";
import { RecommendationsList } from "../components/ui/RecommendationsList";
import { ChallengeOfTheDayWidget } from "../components/ui/ChallengeOfTheDayWidget";
import { DailyQuoteWidget } from "../components/ui/DailyQuoteWidget";
const FACTS = [
  "Git was created in 2005 by Linus Torvalds because he was frustrated with the commercial tool they were using for Linux development.",
  "Modern servers run on Linux, browsers run on Chromium, and compilers run on open source languages: the internet is built on OSS.",
  "The term 'Open Source' was officially adopted in 1998 in Palo Alto, California, to make software sharing more business-friendly.",
  "Richard Stallman launched the GNU Project in 1983, publishing the GNU Manifesto to advocate for computer user freedoms.",
  "Spamming duplicate or low-effort pull requests (like formatting comments) wastes maintainers' time and can get you blocked.",
  "The Apache HTTP Server project was founded in 1995 and played a key role in the early expansion of the World Wide Web.",
];

const CONTRIBUTORS_CACHE_KEY = "github_contributors_cache";
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface ModuleData {
  id: string;
  title: string;
  lessons: { slug: string }[];
}

interface GitHubContributor {
  login: string;
  avatar_url: string;
  html_url: string;
}

interface PendingPR {
  id: number;
  created_at: string;
  title: string;
  contributor: string;
  issue_title: string;
}

interface AssignedIssue {
  id: number;
  points: number;
  title: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data: lessonStats, isLoading: statsLoading } = useQuery({
  queryKey: ['daily-lesson-stats'],
  queryFn: () => fetchApi('/progress/daily-stats/'),
  });
  const { progress, isLessonCompleted } = useUserProgress();
  const { bookmarks, isLoading: isLoadingBookmarks, toggleBookmark } = useBookmarks();

  const [tourKey, setTourKey] = useState(0);

  // 1. Fetch static modules catalog
  const [curriculumData, setCurriculumData] = useState<ModuleData[]>([]);
  useEffect(() => {
    fetch("/content/curriculum.json")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.modules) {
          setCurriculumData(data.modules);
        }
      })
      .catch((err) =>
        console.error("Error loading dashboard curriculum:", err),
      );
  }, []);

  // 2. Fetch Admin Dashboard stats (only queries if user is staff)
  const {
    data: adminData,
    isLoading: isAdminLoading,
    error: adminError,
  } = useQuery({
    queryKey: ["adminDashboardStats"],
    queryFn: () => fetchApi("/dashboard/admin/", { suppressErrorToast: true }),
    enabled: !!user?.is_staff,
  });

  // 3. Fetch paginated leaderboard for admin chart (only queries if user is staff)
  const { data: leaderboardData, isLoading: isLeaderboardLoading } = useQuery({
    queryKey: ["leaderboard", 1],
    queryFn: () => fetchApi("/leaderboard/", { suppressErrorToast: true }),
    enabled: !!user?.is_staff,
  });

  // 4. Fetch Contributor Dashboard stats (only queries if user is NOT staff)
  const {
    data: contributorData,
    isLoading: isContributorLoading,
    error: contributorError,
  } = useQuery({
    queryKey: ["contributorDashboardStats"],
    queryFn: () =>
      fetchApi("/dashboard/contributor/", { suppressErrorToast: true }),
    enabled: !!user && !user.is_staff,
  });

  // 5. Fetch standard list of lessons via cache
  const { data: lessons = [], isLoading: isLessonsLoading } = useQuery<
    Lesson[]
  >({
    queryKey: ["lessons"],
    queryFn: fetchLessonsApi,
    enabled: !user?.is_staff,
  });

  // 6. Fetch personalized learning path
  const { data: learningPathData, isLoading: isLearningPathLoading } =
    useQuery<any>({
      queryKey: ["learningPath"],
      queryFn: () => fetchApi("/users/me/learning-path/"),
      enabled: !!user && !user.is_staff,
    });

  const isLoading = isAdminLoading || isContributorLoading || isLessonsLoading;

  const [showSkeleton, setShowSkeleton] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setShowSkeleton(true);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(false), 400);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Random Fact of the Day
  const factOfDay = useMemo(() => {
    const day = new Date().getDate();
    return FACTS[day % FACTS.length];
  }, []);

  // GitHub Live Contributors list
  const [gitHubContributors, setGitHubContributors] = useState<
    { login: string; avatar_url: string; html_url: string }[]
  >([]);
  useEffect(() => {
    const fallbackContributors = [
      {
        login: "goyaljiiiiii",
        avatar_url: "https://github.com/goyaljiiiiii.png",
        html_url: "https://github.com/goyaljiiiiii",
      },
      {
        login: "nandini",
        avatar_url: "https://github.com/github.png",
        html_url: "https://github.com",
      },
      {
        login: "antigravity",
        avatar_url: "https://github.com/google.png",
        html_url: "https://github.com",
      },
    ];

    fetch(
      "https://api.github.com/repos/goyaljiiiiii/Open-Source-Contribution-Atelier/contributors",
    )
      .then((res) => {
        if (!res.ok) throw new Error("API Limit");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const contributors = data.slice(0, 8);

          setGitHubContributors(contributors);

          localStorage.setItem(
            CONTRIBUTORS_CACHE_KEY,
            JSON.stringify({
              data: contributors,
              timestamp: Date.now(),
            }),
          );
        }
      })
      .catch(() => {
        const cachedData = localStorage.getItem(CONTRIBUTORS_CACHE_KEY);

        if (cachedData) {
          try {
            const parsedCache = JSON.parse(cachedData);

            const isCacheValid =
              Date.now() - parsedCache.timestamp < CACHE_EXPIRY;

            if (isCacheValid) {
              setGitHubContributors(parsedCache.data);
              return;
            }

            localStorage.removeItem(CONTRIBUTORS_CACHE_KEY);
          } catch {
            localStorage.removeItem(CONTRIBUTORS_CACHE_KEY);
          }
        }

        setGitHubContributors(fallbackContributors);
      });
  }, []);

  // Onboarding Tour state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  useEffect(() => {
    if (user && !user.is_staff) {
      const isBoarded = localStorage.getItem("atelier_onboarded");
      if (!isBoarded) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  const handleFinishOnboarding = () => {
    localStorage.setItem("atelier_onboarded", "true");
    setShowOnboarding(false);
  };

  // Certificate Modal state
  const [showCertificate, setShowCertificate] = useState(false);
  // Progress Report Modal state
  const [showProgressReport, setShowProgressReport] = useState(false);

  // Compute local progress metrics based on frontend curriculum data
  const {
    completedLessonsCount,
    totalLessonsCount,
    completionPercentage,
    activeLessonsQueue,
    earnedBadges,
  } = useMemo(() => {
    if (user?.is_staff || !lessons.length || !curriculumData.length) {
      return {
        completedLessonsCount: 0,
        totalLessonsCount: 0,
        completionPercentage: 0,
        activeLessonsQueue: [],
        earnedBadges: [],
      };
    }

    const total = lessons.length;
    const completed = lessons.filter((l) => isLessonCompleted(l.slug)).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Build the lessons queue (uncompleted ones first, up to 3)
    const queue = lessons.filter((l) => !isLessonCompleted(l.slug)).slice(0, 3);

    // Calculate which badges are earned
    const earned = new Set<string>(
      contributorData?.personal_stats?.earned_badges || [],
    );
    curriculumData.forEach((mod, index) => {
      const allCompleted = mod.lessons.every((les: { slug: string }) =>
        isLessonCompleted(les.slug),
      );
      if (allCompleted) {
        earned.add(`mod-${index + 1}`);
      }
    });

    if (percentage === 100) {
      earned.add("grad");
    }

    return {
      completedLessonsCount: completed,
      totalLessonsCount: total,
      completionPercentage: percentage,
      activeLessonsQueue: queue,
      earnedBadges: Array.from(earned),
    };
  }, [lessons, curriculumData, isLessonCompleted, user, contributorData]);

  // Fetch user certificate if course is completed
  const { data: certificateData } = useQuery({
    queryKey: ["userCertificate"],
    queryFn: () =>
      fetchApi("/progress/certificate/", { suppressErrorToast: true }),
    enabled: !!user && !user.is_staff && completionPercentage === 100,
    retry: false,
  });

  if (showSkeleton) {
    if (user?.is_staff) {
      return (
        <div aria-busy="true" role="status">
          <SkeletonAdminDashboard />
          <span className="sr-only">Loading admin dashboard...</span>
        </div>
      );
    }
    return (
      <div aria-busy="true" role="status">
        <SkeletonContributorDashboard />
        <span className="sr-only">Loading dashboard...</span>
      </div>
    );
  }

  // Admin Dashboard Render
  if (user?.is_staff) {
    if (adminError || !adminData) {
      return (
        <div className="pt-24 max-w-7xl mx-auto px-4">
          <div className="p-8 text-center bg-red-100 rounded-2xl border-4 border-black font-bold">
            Failed to load Maintainer Dashboard. Please run the backend seed
            script.
          </div>
        </div>
      );
    }

    const { system_stats, pending_prs } = adminData;
    const leaderboardResults = leaderboardData?.results || [];
    const issueStatusData = [
      { name: "Open", value: system_stats.open_issues },
      { name: "In Progress", value: system_stats.in_progress_issues },
      { name: "Solved", value: system_stats.solved_issues },
    ];
    const COLORS = ["#ffcc00", "#ff9500", "#ff3b30"];

  return user?.is_staff
    ? <AdminDashboard />
    : <ContributorDashboard />;
}

export default DashboardPage;
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";

const GREEN = "#1C5141";

interface GuideUseCase {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
}

interface GuideTopic {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  overview: string;
  steps: string[];
  tip?: string;
}

const ADMIN_USE_CASES: GuideUseCase[] = [
  {
    icon: "people-outline",
    title: "Manage User Accounts",
    summary: "View registered commuters and assign Administrator or Registered User roles.",
  },
  {
    icon: "bus-outline",
    title: "Update Campus Routes",
    summary: "Mark transit routes as Active, Rerouted, or Suspended and post detour notes.",
  },
  {
    icon: "megaphone-outline",
    title: "Post & Delete Advisories",
    summary: "Publish regular travel notices or urgent Broadcast Alerts and remove old posts.",
  },
  {
    icon: "chatbubbles-outline",
    title: "Review Commuter Reports",
    summary: "Check road issues submitted by commuters and send official Transit Desk replies.",
  },
  {
    icon: "time-outline",
    title: "Check Audit Logs",
    summary: "Review a date-stamped record of every administrative update made in the app.",
  },
];

const ADMIN_TOPICS: GuideTopic[] = [
  {
    id: "admin-accounts",
    icon: "people-outline",
    title: "1. Managing User Accounts & Roles",
    subtitle: "Admin Tab → Accounts",
    overview:
      "Keep track of everyone registered in TARA-neta and manage who has administrative access to the university transit desk.",
    steps: [
      "Open the Admin tab on the bottom navigation bar and select Accounts.",
      "Use the All Users, Admins, Users, and Guests filter buttons to narrow down the list, or tap the Refresh icon at the top right for the latest records.",
      "Tap Change Role on a user card to assign them as an Administrator or a Registered User.",
      "Confirm your choice. The updated role takes effect immediately and is recorded in Audit Logs.",
    ],
    tip: "Guest Commuter is not listed under Change Role because Guest mode is only for visitors who choose to browse the app without signing up.",
  },
  {
    id: "admin-routes",
    icon: "bus-outline",
    title: "2. Updating Campus Transit Routes",
    subtitle: "Admin Tab → Routes & Status",
    overview:
      "Let commuters know right away when a regular jeepney, bus, or tricycle line to DLSAU has a road detour or temporary suspension.",
    steps: [
      "In the Admin Panel, tap the Routes & Status sub-tab to see all campus transit routes.",
      "Find the affected route and tap Update.",
      "Choose Active (normal trips), Rerouted (temporary detour), or Suspended (trips paused).",
      "Write a short, clear detour or advisory note explaining which road or gate is affected, then tap Save Status & Log Change.",
      "Once normal trips resume, tap Update again and set the route back to Active to clear the detour notice.",
    ],
    tip: "Every route update shows your admin email and date stamp on the route card so staff know when it was last checked.",
  },
  {
    id: "admin-advisories",
    icon: "megaphone-outline",
    title: "3. Posting & Deleting Advisories",
    subtitle: "Admin Tab → Advisories",
    overview:
      "Share official campus travel reminders, gate schedules, fare guides, or urgent weather and traffic alerts with all commuters.",
    steps: [
      "Open the Advisories sub-tab in the Admin Panel and tap + Post Advisory.",
      "Pick a category: Transit Advisory, Campus Advisory, or Fare Guides.",
      "Only check Broadcast Alert (Priority Alert) if the notice is urgent (such as heavy flooding or sudden road closures). Leave it unchecked for everyday announcements.",
      "Enter a clear Title and detailed Instructions, then tap Publish Advisory.",
      "To remove an outdated announcement, tap the red Delete button on its card and confirm.",
    ],
    tip: "To keep commuter feeds clean, the app automatically prevents posting duplicate titles or identical advisory messages.",
  },
  {
    id: "admin-feedback",
    icon: "chatbubbles-outline",
    title: "4. Reviewing & Replying to Commuter Reports",
    subtitle: "Admin Tab → Feedback Desk",
    overview:
      "Read traffic disruptions, reroute tips, and commute questions sent in by students and visitors, and reply with verified guidance.",
    steps: [
      "Open the Feedback Desk sub-tab to view submitted commuter reports and their urgency badges.",
      "Tap Review / Triage on a report card.",
      "Choose the appropriate status: Under Review, Verified, or Resolved.",
      "Type a helpful official reply in the response box and tap Save Report Status.",
      "The commuter will immediately see the updated status and your official reply under their Status Tracking tab.",
    ],
    tip: "Marking a report as Verified updates the commuter's tracking status without automatically turning it into a public Broadcast Alert. If everyone needs to be warned, post an official advisory under Advisories.",
  },
  {
    id: "admin-logs",
    icon: "time-outline",
    title: "5. Reviewing Activity & Audit Logs",
    subtitle: "Admin Tab → Audit Logs",
    overview:
      "Maintain transparency across administrators by checking the chronological history of updates made in the Admin Panel.",
    steps: [
      "Open the Audit Logs sub-tab in the Admin Panel.",
      "Scroll through the newest-first list to check role changes, route status updates, published or deleted advisories, and reviewed commuter reports.",
      "Pull down on the screen anytime to refresh the latest log entries.",
    ],
  },
];

const USER_USE_CASES: GuideUseCase[] = [
  {
    icon: "compass-outline",
    title: "Search Campus Routes",
    summary: "Find jeepney, train, bus, and tricycle routes to DLSAU with clear fares and signboards.",
  },
  {
    icon: "navigate-outline",
    title: "Follow Live Trip Alerts",
    summary: "Track your ride on the map with spoken reminders before transfers and campus arrival.",
  },
  {
    icon: "bookmark-outline",
    title: "Save Routes & History",
    summary: "Bookmark go-to routes and repeat past commutes in a single tap.",
  },
  {
    icon: "calendar-outline",
    title: "Track Class Schedules",
    summary: "Save class times and get a heads-up if a slower route might make you late.",
  },
  {
    icon: "pricetag-outline",
    title: "Apply 20% Fare Discount",
    summary: "Switch between Regular fare and Student, Senior, or PWD 20% discounted fares.",
  },
  {
    icon: "alert-circle-outline",
    title: "Check Alerts & Report Issues",
    summary: "Read campus travel advisories or report delays and track Transit Desk replies.",
  },
];

const USER_TOPICS: GuideTopic[] = [
  {
    id: "user-search",
    icon: "compass-outline",
    title: "1. Searching for a Route to DLSAU",
    subtitle: "Home Search Bar or Search Tab",
    overview:
      "Compare verified public transit options from your current spot or any nearby station straight to De La Salle Araneta University.",
    steps: [
      "Tap the Search bar on Home or open the Search tab at the bottom.",
      "Keep Starting Point as Your location (make sure phone location is turned on), or type at least 2 letters of a station or landmark (such as Monumento) and pick a suggested place.",
      "The destination stays set to De La Salle Araneta University so every route leads to campus. Tap Show route.",
      "Use All Routes, Fastest Routes, or Cheapest Routes to compare travel times and fares.",
      "Pull up Ride details to see each step's vehicle type, signboard to look for, and exact phrase to tell the driver.",
    ],
    tip: "Tap any colored route line directly on the map to view a quick summary of that ride leg.",
  },
  {
    id: "user-fares",
    icon: "wallet-outline",
    title: "2. Fares & 20% Student / Senior / PWD Discount",
    subtitle: "Profile Tab → Discount Type",
    overview:
      "See realistic fare estimates for every leg of your trip, whether you pay regular fare or qualify for a 20% commuter discount.",
    steps: [
      "Open the Profile tab and tap Discount Type under Account Settings.",
      "Select Discounted (20%) if you are a student, senior citizen, or PWD commuter, or select Regular fare.",
      "Return to Search to see updated fares across jeepneys, buses, trains, and shared tricycles.",
    ],
    tip: "Shared tricycle rides receive the 20% discount (for example, ₱15 regular becomes ₱12 discounted), while a ₱50 solo special tricycle trip stays fixed at ₱50.",
  },
  {
    id: "user-live-trip",
    icon: "navigate-outline",
    title: "3. Live Trip Navigation & Voice Reminders",
    subtitle: "Search Tab → Start Trip",
    overview:
      "Let TARA-neta guide you in real time while you commute so you never miss your transfer stop or campus gate.",
    steps: [
      "After picking a route on Search, tap Start trip.",
      "Listen to the spoken boarding guide telling you where to board and which signboard to look for.",
      "Tap View directions & details anytime during your ride to check full step-by-step instructions, remaining distance, and commuter tips.",
      "When you come within 150 meters of a transfer stop—or within 100 meters of DLSAU—your phone will vibrate, show an alert banner, and announce the stop.",
      "Tap End Trip once you arrive to save the completed commute to your History.",
    ],
  },
  {
    id: "user-history",
    icon: "time-outline",
    title: "4. Bookmarked Routes & Trip History",
    subtitle: "Home Carousel & History Tab",
    overview:
      "Keep your favorite routes handy on the Home screen and review or repeat your past commutes anytime.",
    steps: [
      "On any route card in Search, tap the bookmark icon at the top right to save that route (tap again anytime to remove it).",
      "On the Home screen, swipe through Bookmarked routes and tap Re-Route to launch that trip right away.",
      "Open the History tab to switch between All, Recent Trips, and Saved Routes, or type a station keyword in the search box.",
      "Tap Repeat this trip on any card to load it in Search, or tap the trash icon to delete old entries.",
    ],
  },
  {
    id: "user-schedule",
    icon: "calendar-outline",
    title: "5. Class Schedule & Late Arrival Warnings",
    subtitle: "Schedule Tab",
    overview:
      "Save your weekly classes so TARA-neta can highlight your next class and warn you if a slower transit route runs close to class time.",
    steps: [
      "Open the Schedule tab on the bottom navigation bar.",
      "Enter your Subject Code (for example, IT302) and Subject Name.",
      "Tap the weekdays when the class meets (Mon through Sat).",
      "Type the class start time in 12-hour format (such as 8:30), pick AM or PM, and tap Add class.",
      "Check the green Next class card at the top to see which class is coming up soonest, or tap the red trash icon to remove old classes.",
    ],
    tip: "When you search routes shortly before a class starts, TARA-neta shows an amber Schedule Alert if a route might arrive late—with a one-tap button to switch to a faster option.",
  },
  {
    id: "user-advisories",
    icon: "megaphone-outline",
    title: "6. Transit Advisories & Reporting an Issue",
    subtitle: "Home Quick Actions",
    overview:
      "Stay informed about campus gate updates and road detours, or let the University Transit Desk know about delays along your route.",
    steps: [
      "Tap Transit Advisories on the Home screen to read Transit Advisories, Campus Advisories, Fare Guides, and urgent Broadcast Alerts.",
      "To report a traffic delay, reroute, or ask a commute question, tap Report Transit Issue on Home (or tap Submit Inquiry at the bottom of Advisories).",
      "Choose an issue category, enter the affected route or landmark, describe what happened, pick an urgency level, and submit.",
      "Switch to the Status Tracking tab anytime to check if your report is Under Review, Verified, or Resolved and read the Admin's official reply.",
    ],
  },
  {
    id: "user-profile",
    icon: "person-outline",
    title: "7. Profile, Password & Support",
    subtitle: "Profile Tab",
    overview:
      "Keep your commuter profile up to date, review your travel totals, or reach out for help.",
    steps: [
      "Open Profile to see your Trips taken, Saved routes, and Total fare summary.",
      "Tap the circular photo button to choose a profile picture from your phone gallery.",
      "Tap Edit Profile to update your display name or school, or tap Change Password to set a new password (at least 8 characters).",
      "Under Support, tap Guide to reopen these instructions anytime, Help & Support to email the team, or Log Out when finished.",
    ],
  },
];

const GUEST_USE_CASES: GuideUseCase[] = [
  {
    icon: "compass-outline",
    title: "Search Campus Routes",
    summary: "Look up public transit routes, travel times, and regular fares to DLSAU right away.",
  },
  {
    icon: "navigate-outline",
    title: "Live Map & Voice Guide",
    summary: "Follow your commute live on the map with transfer and campus arrival reminders.",
  },
  {
    icon: "megaphone-outline",
    title: "Read Official Advisories",
    summary: "Check campus travel notices, fare guides, and priority Broadcast Alerts.",
  },
  {
    icon: "alert-circle-outline",
    title: "Send Transit Reports",
    summary: "Report road closures or ask commute questions without needing an account.",
  },
];

const GUEST_TOPICS: GuideTopic[] = [
  {
    id: "guest-search",
    icon: "compass-outline",
    title: "1. Finding a Route & Checking Regular Fares",
    subtitle: "Home Search Bar or Search Tab",
    overview:
      "As a Guest Commuter, you can search routes and read full commute directions to De La Salle Araneta University without signing up.",
    steps: [
      "Tap the Search bar on Home or tap the Search icon on the bottom bar.",
      "Use Your location (with location access enabled) or type at least 2 letters of a starting landmark (such as Monumento) and select a suggestion.",
      "Tap Show route to view available jeepney, train, bus, and tricycle routes to DLSAU.",
      "Switch between All Routes, Fastest Routes, and Cheapest Routes to compare regular fares and travel times.",
      "Expand Ride details to check signboards to look for and what to tell the driver at each stop.",
    ],
  },
  {
    id: "guest-live-trip",
    icon: "navigate-outline",
    title: "2. Using Live Trip Navigation",
    subtitle: "Search Tab → Start Trip",
    overview:
      "Follow your ride on the map in real time so you know exactly where to transfer and when you reach campus.",
    steps: [
      "Select your preferred route in Search and tap Start trip.",
      "Listen to the spoken boarding instructions and tap View directions & details anytime to read all steps.",
      "Keep location turned on—TARA-neta will alert you within 150 meters of transfer points and within 100 meters of DLSAU.",
      "Tap End Trip when you arrive to return to the Search map.",
    ],
  },
  {
    id: "guest-advisories",
    icon: "megaphone-outline",
    title: "3. Checking Advisories & Reporting Issues",
    subtitle: "Home Quick Actions",
    overview:
      "View public travel announcements or share road updates with the University Transit Desk.",
    steps: [
      "On the Home screen, tap Transit Advisories to browse Transit Advisories, Campus Advisories, Fare Guides, and Broadcast Alerts.",
      "Tap Report Transit Issue on Home to report a reroute, delay, or commute question.",
      "Fill in the affected route or landmark and a short description, then submit and check Status Tracking on your device.",
    ],
  },
  {
    id: "guest-upgrade",
    icon: "lock-open-outline",
    title: "4. Guest Mode vs. Free Registered Account",
    subtitle: "Tap Sign In on Home Anytime",
    overview:
      "Guest Mode gives you instant route search and live navigation, while creating a free account unlocks personal commuter tools across your devices.",
    steps: [
      "Bookmark Favorite Routes: Save frequent routes and launch them in one tap from Home.",
      "Trip History: Automatically keep a log of completed commutes and total fares spent.",
      "Class Schedule & Late Alerts: Save your DLSAU classes and get warned if a route runs past class start time.",
      "20% Fare Discount Setting: Switch from Regular fare to Student, Senior, or PWD 20% discounted fare estimates.",
    ],
    tip: "Ready to unlock everything? Tap the Sign In button at the top right of the Home screen anytime to sign in or create an account.",
  },
];

export default function SystemGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, isGuest, logoutGuest } = useAuth();

  // Admins can view their Admin Guide by default and also switch to the Commuter Guide
  const [adminViewMode, setAdminViewMode] = useState<"admin" | "commuter">("admin");

  const activePersona: "admin" | "user" | "guest" = useMemo(() => {
    if (isAdmin) {
      return adminViewMode === "admin" ? "admin" : "user";
    }
    if (isGuest) return "guest";
    return "user";
  }, [adminViewMode, isAdmin, isGuest]);

  const useCases = useMemo(() => {
    if (activePersona === "admin") return ADMIN_USE_CASES;
    if (activePersona === "guest") return GUEST_USE_CASES;
    return USER_USE_CASES;
  }, [activePersona]);

  const topics = useMemo(() => {
    if (activePersona === "admin") return ADMIN_TOPICS;
    if (activePersona === "guest") return GUEST_TOPICS;
    return USER_TOPICS;
  }, [activePersona]);

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    "admin-accounts": true,
    "user-search": true,
    "guest-search": true,
  });

  const allExpanded = useMemo(
    () => topics.every((t) => Boolean(expandedIds[t.id])),
    [expandedIds, topics]
  );

  function toggleTopic(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleExpandAll() {
    const nextState = !allExpanded;
    const updated: Record<string, boolean> = { ...expandedIds };
    for (const t of topics) {
      updated[t.id] = nextState;
    }
    setExpandedIds(updated);
  }

  function handleGoBack() {
    if (Platform.OS === "web") {
      if (router.canGoBack()) {
        router.back();
      } else if (typeof window !== "undefined" && window.history && window.history.length > 1) {
        window.history.back();
      } else {
        router.replace("/(main)");
      }
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(main)");
    }
  }

  const badgeLabel = isAdmin
    ? "ADMINISTRATOR"
    : isGuest
      ? "GUEST COMMUTER"
      : "REGISTERED USER";

  const heroTitle =
    activePersona === "admin"
      ? "TARA-neta Administrator Guide"
      : activePersona === "guest"
        ? "TARA-neta Guest Commuter Guide"
        : "TARA-neta User & Commuter Guide";

  const heroDescription =
    activePersona === "admin"
      ? "TARA-neta is De La Salle Araneta University's public transit companion. As an Administrator, you help keep campus routes, travel advisories, user roles, and commuter reports accurate and up to date for everyone traveling to DLSAU."
      : activePersona === "guest"
        ? "TARA-neta helps you travel smoothly to De La Salle Araneta University using jeepneys, trains, buses, and tricycles. As a Guest, you can search routes, check regular fares, follow live map directions, and read campus advisories right away."
        : "TARA-neta is your everyday public transit companion to De La Salle Araneta University—giving you clear route options, fare estimates, signboard tips, live stop reminders, class schedule alerts, and official campus travel updates.";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleGoBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={GREEN} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>System Guide</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{badgeLabel}</Text>
            </View>
          </View>
          <Text style={styles.headerSub} numberOfLines={1}>
            Plain, step-by-step instructions & use cases
          </Text>
        </View>
      </View>

      {/* Optional Switcher for Admins so they can view both Admin & Commuter guides */}
      {isAdmin && (
        <View style={styles.switcherBar}>
          <Pressable
            onPress={() => setAdminViewMode("admin")}
            style={[
              styles.switcherPill,
              adminViewMode === "admin" && styles.switcherPillActive,
            ]}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color={adminViewMode === "admin" ? "#fff" : "#475569"}
            />
            <Text
              style={[
                styles.switcherText,
                adminViewMode === "admin" && styles.switcherTextActive,
              ]}
            >
              Admin Guide
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminViewMode("commuter")}
            style={[
              styles.switcherPill,
              adminViewMode === "commuter" && styles.switcherPillActive,
            ]}
          >
            <Ionicons
              name="compass-outline"
              size={15}
              color={adminViewMode === "commuter" ? "#fff" : "#475569"}
            />
            <Text
              style={[
                styles.switcherText,
                adminViewMode === "commuter" && styles.switcherTextActive,
              ]}
            >
              Commuter Guide
            </Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* General Overview Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconRow}>
            <View style={styles.heroIconCircle}>
              <Ionicons
                name={
                  activePersona === "admin"
                    ? "shield-checkmark"
                    : activePersona === "guest"
                      ? "walk"
                      : "book"
                }
                size={22}
                color="#fff"
              />
            </View>
            <Text style={styles.heroOverline}>GENERAL SYSTEM OVERVIEW</Text>
          </View>
          <Text style={styles.heroTitle}>{heroTitle}</Text>
          <Text style={styles.heroBody}>{heroDescription}</Text>
        </View>

        {/* Main Use Cases Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {activePersona === "admin"
              ? "Admin Use Cases at a Glance"
              : activePersona === "guest"
                ? "What You Can Do as a Guest"
                : "Your Main Use Cases"}
          </Text>
        </View>

        <View style={styles.useCaseGrid}>
          {useCases.map((uc) => (
            <View key={uc.title} style={styles.useCaseCard}>
              <View style={styles.useCaseIconWrap}>
                <Ionicons name={uc.icon} size={18} color={GREEN} />
              </View>
              <View style={styles.useCaseTextWrap}>
                <Text style={styles.useCaseTitle}>{uc.title}</Text>
                <Text style={styles.useCaseSummary}>{uc.summary}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Step-by-Step How-To Sections */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Step-by-Step Instructions</Text>
          <Pressable onPress={toggleExpandAll} hitSlop={8}>
            <Text style={styles.expandAllText}>
              {allExpanded ? "Collapse all" : "Expand all"}
            </Text>
          </Pressable>
        </View>

        {topics.map((topic) => {
          const isOpen = Boolean(expandedIds[topic.id]);
          return (
            <View key={topic.id} style={styles.topicCard}>
              <Pressable
                onPress={() => toggleTopic(topic.id)}
                style={styles.topicHeader}
                accessibilityRole="button"
              >
                <View style={styles.topicIconBox}>
                  <Ionicons name={topic.icon} size={20} color={GREEN} />
                </View>
                <View style={styles.topicTitleWrap}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <Text style={styles.topicSubtitle}>{topic.subtitle}</Text>
                </View>
                <Ionicons
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#64748b"
                />
              </Pressable>

              {isOpen && (
                <View style={styles.topicBody}>
                  <Text style={styles.topicOverview}>{topic.overview}</Text>

                  <View style={styles.stepsList}>
                    {topic.steps.map((step, idx) => (
                      <View key={idx} style={styles.stepRow}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}
                  </View>

                  {topic.tip ? (
                    <View style={styles.tipBox}>
                      <Ionicons
                        name="bulb-outline"
                        size={17}
                        color="#92400e"
                        style={{ marginTop: 1 }}
                      />
                      <Text style={styles.tipText}>{topic.tip}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}

        {/* University Info & About DLSAU Card */}
        <View style={styles.aboutCard}>
          <View style={styles.aboutHeaderRow}>
            <View style={styles.aboutIconCircle}>
              <Ionicons name="school" size={20} color="#fff" />
            </View>
            <View style={styles.aboutTextCol}>
              <Text style={styles.aboutTitle}>De La Salle Araneta University</Text>
              <Text style={styles.aboutSub}>Official University Portal</Text>
            </View>
          </View>
          <Text style={styles.aboutDesc}>
            Discover DLSAU's history, academic programs, campus landmarks, and Lasallian mission.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.aboutBtn, pressed && { opacity: 0.88 }]}
            onPress={() => {
              void Linking.openURL("https://www.dlsau.edu.ph/about/university/index.html").catch(() => {});
            }}
            accessibilityRole="link"
            accessibilityLabel="About DLSAU website"
          >
            <Ionicons name="open-outline" size={16} color="#fff" />
            <Text style={styles.aboutBtnText}>About DLSAU</Text>
          </Pressable>
        </View>

        {/* Bottom Role-Aware Quick Action */}
        {isGuest ? (
          <View style={styles.ctaBanner}>
            <Text style={styles.ctaTitle}>Want to unlock saved routes & discounts?</Text>
            <Text style={styles.ctaSubtitle}>
              Sign in or create a free account anytime to bookmark routes, save your class schedule, and apply the 20% commuter discount.
            </Text>
            <Pressable
              style={styles.ctaBtn}
              onPress={async () => {
                await logoutGuest();
                router.replace("/welcome");
              }}
            >
              <Ionicons name="log-in-outline" size={17} color="#fff" />
              <Text style={styles.ctaBtnText}>Sign In or Create Account</Text>
            </Pressable>
          </View>
        ) : isAdmin && activePersona === "admin" ? (
          <View style={styles.ctaBanner}>
            <Text style={styles.ctaTitle}>Ready to manage campus transit?</Text>
            <Text style={styles.ctaSubtitle}>
              Jump straight to the Admin Panel to review commuter reports, update route statuses, or post advisories.
            </Text>
            <Pressable
              style={styles.ctaBtn}
              onPress={() => router.push("/(main)/admin" as any)}
            >
              <Ionicons name="shield-checkmark-outline" size={17} color="#fff" />
              <Text style={styles.ctaBtnText}>Open Admin Panel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.ctaBanner}>
            <Text style={styles.ctaTitle}>Ready to plan your commute?</Text>
            <Text style={styles.ctaSubtitle}>
              Head to Route Search to compare options and start a live guided trip to De La Salle Araneta University.
            </Text>
            <Pressable
              style={styles.ctaBtn}
              onPress={() => router.push("/(main)/search" as any)}
            >
              <Ionicons name="compass-outline" size={17} color="#fff" />
              <Text style={styles.ctaBtnText}>Open Route Search</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backBtn: {
    padding: 4,
    marginRight: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  roleBadge: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: GREEN,
    letterSpacing: 0.4,
  },
  headerSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  switcherBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  switcherPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  switcherPillActive: {
    backgroundColor: GREEN,
  },
  switcherText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  switcherTextActive: {
    color: "#ffffff",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  heroCard: {
    backgroundColor: GREEN,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  heroIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  heroIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroOverline: {
    fontSize: 11,
    fontWeight: "800",
    color: "#bbf7d0",
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "rgba(255,255,255,0.93)",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  expandAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
  },
  useCaseGrid: {
    gap: 10,
    marginBottom: 22,
  },
  useCaseCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  useCaseIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },
  useCaseTextWrap: {
    flex: 1,
  },
  useCaseTitle: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0f172a",
  },
  useCaseSummary: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748b",
    marginTop: 2,
  },
  topicCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    overflow: "hidden",
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  topicIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  topicTitleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  topicTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#0f172a",
  },
  topicSubtitle: {
    fontSize: 12,
    color: GREEN,
    fontWeight: "600",
    marginTop: 2,
  },
  topicBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  topicOverview: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "#334155",
    marginTop: 8,
    marginBottom: 12,
  },
  stepsList: {
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },
  stepBadgeText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#ffffff",
  },
  stepText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#1e293b",
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  tipText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#92400e",
  },
  aboutCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  aboutHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  aboutIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  aboutTextCol: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  aboutSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  aboutDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
    marginBottom: 12,
  },
  aboutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: GREEN,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  aboutBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  ctaBanner: {
    backgroundColor: "#ecfdf5",
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
  },
  ctaTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: GREEN,
    textAlign: "center",
  },
  ctaSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#334155",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GREEN,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
  },
  ctaBtnText: {
    color: "#ffffff",
    fontSize: 13.5,
    fontWeight: "700",
  },
});

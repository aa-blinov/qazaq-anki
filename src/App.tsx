import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { FontSizeProvider } from './contexts/FontSizeContext';
import { ProgressProvider } from './contexts/ProgressContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { UserCardsProvider } from './contexts/UserCardsContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { StudyPage } from './pages/StudyPage';
import { BrowsePage } from './pages/BrowsePage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { loadAudioManifest } from './lib/tts';

/**
 * Back-compat shim for the old /study/:levelId URL.
 *
 * The current shape is /study (cross-level due queue) and
 * /study/level/:levelId (one specific CEFR level). Older links
 * — bookmarks, hand-typed URLs, the welcome CTA's previous
 * target /study/all — land here and are 301-equivalent'd to the
 * new shape.
 *
 * `replace` so the user doesn't accumulate a long back-stack
 * of "/study/old → /study/new" pairs. Search params are carried
 * over verbatim (so a bookmark like /study/a1?topic=family
 * still ends up at the right topic).
 */
function RedirectLegacyStudy() {
  const { levelId } = useParams<{ levelId: string }>();
  const { search } = useLocation();
  const target =
    !levelId || levelId.toLowerCase() === 'all'
      ? `/study${search}`
      : `/study/level/${levelId.toLowerCase()}${search}`;
  return <Navigate to={target} replace />;
}

export default function App() {
  // Kick off the TTS manifest fetch as soon as the app mounts.
  // Both languages are loaded in parallel; each call is idempotent
  // (singleton promise) and the file is small (~70 KB) so the
  // combined cost is negligible. The Flashcard uses the populated
  // sets to decide whether to show the speak button on either
  // side of the card.
  useEffect(() => {
    void loadAudioManifest('kk');
    void loadAudioManifest('ru');
  }, []);

  return (
    <ThemeProvider>
      <FontSizeProvider>
        <LanguageProvider>
          <AuthProvider>
            <OnboardingProvider>
              <ProgressProvider>
                <UserCardsProvider>
                  <Routes>
                    <Route element={<Layout />}>
                      <Route index element={<HomePage />} />
                      <Route path="login" element={<LoginPage />} />
                      <Route path="register" element={<RegisterPage />} />
                      <Route
                        path="study"
                        element={
                          <ProtectedRoute>
                            <StudyPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="study/level/:levelId"
                        element={
                          <ProtectedRoute>
                            <StudyPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="study/:levelId"
                        element={<RedirectLegacyStudy />}
                      />
                      <Route
                        path="browse"
                        element={
                          <ProtectedRoute>
                            <BrowsePage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="stats"
                        element={
                          <ProtectedRoute>
                            <StatsPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="settings"
                        element={
                          <ProtectedRoute>
                            <SettingsPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </UserCardsProvider>
              </ProgressProvider>
            </OnboardingProvider>
          </AuthProvider>
        </LanguageProvider>
      </FontSizeProvider>
    </ThemeProvider>
  );
}

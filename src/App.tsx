import { HashRouter, Route, Routes } from 'react-router-dom'
import { MetaProvider } from './context/MetaContext'
import { ProfileProvider } from './context/ProfileContext'
import { AppShell, ScrollToTop } from './components/AppShell'
import { OverviewPage } from './pages/Overview'
import { HeroesPage } from './pages/Heroes'
import { HeroDetailPage } from './pages/HeroDetail'
import { MatchesPage } from './pages/Matches'
import { MatchDetailPage } from './pages/MatchDetail'
import { PlayersPage } from './pages/Players'
import { PlayerDetailPage } from './pages/PlayerDetail'
import { PlayerHeroDetailPage } from './pages/PlayerHeroDetail'
import { DraftPage } from './pages/Draft'
import { MetaEscapePage } from './pages/MetaEscape'
import { ParserLabPage } from './pages/ParserLab'
import { ProPage } from './pages/Pro'
import { RecordsPage } from './pages/Records'
import { DataLabPage } from './pages/DataLab'
import { NotFoundPage } from './pages/NotFound'

function App() {
  return (
    <ProfileProvider>
      <MetaProvider>
        <HashRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="heroes" element={<HeroesPage />} />
              <Route path="heroes/:heroId" element={<HeroDetailPage />} />
              <Route path="matches" element={<MatchesPage />} />
              <Route path="matches/:matchId" element={<MatchDetailPage />} />
              <Route path="players" element={<PlayersPage />} />
              <Route path="players/:playerId" element={<PlayerDetailPage />} />
              <Route path="players/:playerId/heroes/:heroId" element={<PlayerHeroDetailPage />} />
              <Route path="draft" element={<DraftPage />} />
              <Route path="meta-escape" element={<MetaEscapePage />} />
              <Route path="parser" element={<ParserLabPage />} />
              <Route path="pro" element={<ProPage />} />
              <Route path="records" element={<RecordsPage />} />
              <Route path="data-lab" element={<DataLabPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </MetaProvider>
    </ProfileProvider>
  )
}

export default App

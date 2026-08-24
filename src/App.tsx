import { CardOverview } from './screens/CardOverview'
import { MainMenu } from './screens/MainMenu'
import { CompanionMode } from './screens/companion/CompanionMode'
import { DigitalMode } from './screens/digital/DigitalMode'
import { useRoute } from './hooks/useRoute'

export default function App() {
  const [mode, navigate] = useRoute()
  // Zurück-Button und "Verlassen"-Pfeil sollen dasselbe tun: einen
  // Verlaufseintrag zurück, nicht stur auf die Startseite springen.
  const back = () => window.history.back()

  return (
    <div className="min-h-screen text-[#e8e4dc] font-sans max-w-lg mx-auto safe-top">
      {mode === 'menu' && <MainMenu onSelect={navigate} />}
      {mode === 'companion' && <CompanionMode onExit={back} />}
      {mode === 'digital' && <DigitalMode onExit={back} />}
      {mode === 'cards' && <CardOverview onExit={back} />}
    </div>
  )
}

import { useState } from 'react'
import { MainMenu, type Mode } from './screens/MainMenu'
import { CompanionMode } from './screens/companion/CompanionMode'
import { DigitalMode } from './screens/digital/DigitalMode'

export default function App() {
  const [mode, setMode] = useState<Mode>('menu')

  return (
    <div className="min-h-screen text-[#e8e4dc] font-sans max-w-lg mx-auto safe-top">
      {mode === 'menu' && <MainMenu onSelect={setMode} />}
      {mode === 'companion' && <CompanionMode onExit={() => setMode('menu')} />}
      {mode === 'digital' && <DigitalMode onExit={() => setMode('menu')} />}
    </div>
  )
}

import { useOnline } from '../../hooks/useOnline'
import { Join } from './Join'
import { Lobby } from './Lobby'
import { Table } from './Table'

export function DigitalMode({ onExit }: { onExit: () => void }) {
  const net = useOnline()
  const { game, code } = net

  const leave = () => {
    net.leave()
    onExit()
  }

  return (
    <>
      {!game || !code ? (
        <Join
          connected={net.connected}
          server={net.server}
          isNative={net.isNative}
          onChangeServer={net.changeServer}
          onCreate={net.create}
          onJoin={net.join}
          onBack={onExit}
        />
      ) : game.phase === 'lobby' ? (
        <Lobby game={game} code={code} onStart={net.start} onKick={net.kick} onLeave={leave} />
      ) : (
        <Table
          game={game}
          onCall={net.call}
          onExchange={net.exchange}
          onSleeper={net.sleeper}
          onPlay={net.play}
          onNext={net.next}
          onKick={net.kick}
          onForce={net.force}
          onLeave={leave}
        />
      )}

      {net.error && (
        <div className="fixed bottom-6 inset-x-4 max-w-lg mx-auto z-50 animate-fade-in">
          <div className="rounded-xl bg-red-500/15 border border-red-500/30 backdrop-blur px-4 py-3 text-sm text-red-200 text-center">
            {net.error}
          </div>
        </div>
      )}

      {!net.connected && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500/15 border-b border-amber-500/25 py-1.5 text-center text-[11px] text-amber-200">
          Verbindung verloren — versuche neu zu verbinden …
        </div>
      )}
    </>
  )
}

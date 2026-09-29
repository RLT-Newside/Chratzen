import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerMsg } from './protocol'
import { createBluetoothTransport, createHostTransport } from './transport'

/** Die nativen Plugins als Attrappe: Ereignisse von Hand auslösen, Aufrufe mitschreiben. */
const fakes = vi.hoisted(() => {
  const make = () => {
    const listeners = new Map<string, ((data: unknown) => void)[]>()
    return {
      listeners,
      emit: (event: string, data: unknown) => {
        for (const cb of listeners.get(event) ?? []) cb(data)
      },
      addListener: vi.fn(async (event: string, cb: (data: unknown) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), cb])
        return { remove: async () => void listeners.set(event, (listeners.get(event) ?? []).filter((x) => x !== cb)) }
      }),
      start: vi.fn(async () => ({ ip: '192.168.43.1', port: 3001, interfaces: [] })),
      stop: vi.fn(async () => {}),
      send: vi.fn(async (_o: { connId: string; data: string }) => {}),
      connect: vi.fn<(o: { address: string }) => Promise<{ connId: string }>>(),
      disconnect: vi.fn(async () => {}),
    }
  }
  return { ChratzenHost: make(), ChratzenBluetooth: make() }
})

vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: keyof typeof fakes) => fakes[name],
}))

const wlan = fakes.ChratzenHost
const bt = fakes.ChratzenBluetooth
const sent = (plugin: typeof bt) => plugin.send.mock.calls.map(([o]) => ({ to: o.connId, msg: JSON.parse(o.data) }))
const handlers = () => ({ onOpen: vi.fn(), onClose: vi.fn(), onError: vi.fn(), onMessage: vi.fn() })

beforeEach(() => {
  vi.clearAllMocks()
  wlan.listeners.clear()
  bt.listeners.clear()
})

describe('Host-Transport', () => {
  it('Bluetooth-Gäste kommen ohne Code an den einen Tisch, WLAN-Gäste nicht', async () => {
    const got: ServerMsg[] = []
    const h = { ...handlers(), onMessage: (m: ServerMsg) => got.push(m) }
    const table = createHostTransport(h, () => {})
    await vi.waitFor(() => expect(h.onOpen).toHaveBeenCalled())

    table.send({ t: 'create', name: 'Anna', ante: 100 })
    const code = got.find((m) => m.t === 'joined')?.code

    bt.emit('message', { connId: 'bt:1', data: JSON.stringify({ t: 'join', code: '', name: 'Beat' }) })
    expect(sent(bt)).toContainEqual({ to: 'bt:1', msg: expect.objectContaining({ t: 'joined', code }) })
    // Der neue Stand geht an beide Drähte, jeder über sein Plugin.
    expect(got.at(-1)).toMatchObject({ t: 'state', game: { players: [{ name: 'Anna' }, { name: 'Beat' }] } })

    wlan.emit('message', { connId: 'ws-1', data: JSON.stringify({ t: 'join', code: '', name: 'Cla' }) })
    expect(sent(wlan)).toEqual([{ to: 'ws-1', msg: { t: 'error', message: 'Tisch nicht gefunden.' } }])

    // Bluetooth-Abbruch in der Lobby: Platz frei.
    bt.emit('close', { connId: 'bt:1' })
    expect(got.at(-1)).toMatchObject({ t: 'state', game: { players: [{ name: 'Anna' }] } })

    table.close()
    expect(bt.stop).toHaveBeenCalled()
    expect(wlan.stop).toHaveBeenCalled()
  })
})

describe('Bluetooth-Gast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('verbindet nach einem Abbruch still neu', async () => {
    const h = handlers()
    bt.connect.mockResolvedValueOnce({ connId: 'bt:a' })
    const guest = createBluetoothTransport('AA:BB:CC:DD:EE:FF', h)
    await vi.advanceTimersByTimeAsync(0)
    expect(bt.connect).toHaveBeenCalledWith({ address: 'AA:BB:CC:DD:EE:FF' })
    expect(h.onOpen).toHaveBeenCalledTimes(1)

    // Nur die eigene Verbindung zählt — das Plugin meldet alle.
    bt.emit('message', { connId: 'bt:fremd', data: '{"t":"kicked"}' })
    bt.emit('message', { connId: 'bt:a', data: '{"t":"kicked"}' })
    expect(h.onMessage.mock.calls).toEqual([[{ t: 'kicked' }]])

    guest.send({ t: 'next' })
    expect(sent(bt)).toEqual([{ to: 'bt:a', msg: { t: 'next' } }])

    // Abbruch: ein Fehlversuch, dann klappt es — alles ohne Meldung.
    bt.connect.mockRejectedValueOnce({ code: 'connect' }).mockResolvedValueOnce({ connId: 'bt:b' })
    bt.emit('close', { connId: 'bt:a' })
    expect(h.onClose).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(h.onOpen).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(h.onOpen).toHaveBeenCalledTimes(2)
    expect(h.onError).not.toHaveBeenCalled()

    guest.close()
    expect(bt.disconnect).toHaveBeenCalledWith({ connId: 'bt:b' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(bt.connect).toHaveBeenCalledTimes(3)
  })

  it('gibt beim allerersten Fehlschlag auf — dann war es wohl das falsche Gerät', async () => {
    const h = handlers()
    bt.connect.mockRejectedValueOnce({ code: 'off' })
    const guest = createBluetoothTransport('AA:BB:CC:DD:EE:FF', h)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.onError).toHaveBeenCalledWith('Bluetooth ist ausgeschaltet.')
    expect(h.onClose).toHaveBeenCalledTimes(1)
    expect(bt.connect).toHaveBeenCalledTimes(1)
    guest.close()
  })
})

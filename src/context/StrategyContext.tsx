import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  deleteStrategy as removeStrategyFromStorage,
  loadAllStrategies,
  upsertStrategy as upsertStrategyInStorage,
} from '../services/strategyStorage'
import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  StrategyChannel,
  StrategyCollection,
  StrategyRecord,
} from '../types/strategy'

interface StrategyContextValue {
  backtestStrategies: BacktestStrategyRecord[]
  liveStrategies: LiveStrategyRecord[]
  upsertStrategy: (strategy: StrategyRecord) => void
  deleteStrategy: (channel: StrategyChannel, id: string) => void
  findStrategy: (
    channel: StrategyChannel,
    id: string,
  ) => BacktestStrategyRecord | LiveStrategyRecord | undefined
  stats: {
    totalStrategies: number
    totalBacktest: number
    totalLive: number
  }
}

const StrategyContext = createContext<StrategyContextValue | null>(null)

function getCollectionByChannel(
  channel: StrategyChannel,
  collection: StrategyCollection,
) {
  return channel === 'backtest' ? collection.backtest : collection.live
}

export function StrategyProvider({ children }: PropsWithChildren) {
  const [collection, setCollection] = useState<StrategyCollection>(() =>
    loadAllStrategies(),
  )

  useEffect(() => {
    const syncOnStorageChange = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('strategy-lab/')) {
        startTransition(() => {
          setCollection(loadAllStrategies())
        })
      }
    }
    window.addEventListener('storage', syncOnStorageChange)
    return () => window.removeEventListener('storage', syncOnStorageChange)
  }, [])

  const contextValue: StrategyContextValue = {
    backtestStrategies: collection.backtest,
    liveStrategies: collection.live,
    upsertStrategy: (strategy) => {
      const updated = upsertStrategyInStorage(strategy)
      startTransition(() => {
        setCollection((prev) =>
          strategy.channel === 'backtest'
            ? { ...prev, backtest: updated as BacktestStrategyRecord[] }
            : { ...prev, live: updated as LiveStrategyRecord[] },
        )
      })
    },
    deleteStrategy: (channel, id) => {
      const updated = removeStrategyFromStorage(channel, id)
      startTransition(() => {
        setCollection((prev) =>
          channel === 'backtest'
            ? { ...prev, backtest: updated as BacktestStrategyRecord[] }
            : { ...prev, live: updated as LiveStrategyRecord[] },
        )
      })
    },
    findStrategy: (channel, id) =>
      getCollectionByChannel(channel, collection).find((item) => item.id === id),
    stats: {
      totalStrategies: collection.backtest.length + collection.live.length,
      totalBacktest: collection.backtest.length,
      totalLive: collection.live.length,
    },
  }

  return (
    <StrategyContext.Provider value={contextValue}>
      {children}
    </StrategyContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStrategies() {
  const context = useContext(StrategyContext)
  if (!context) {
    throw new Error('useStrategies must be used within StrategyProvider')
  }
  return context
}

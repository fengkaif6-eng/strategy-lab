import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  deleteStrategy as removeStrategyFromStorage,
  loadAllStrategies,
  moveStrategy as moveStrategyInStorage,
  upsertStrategy as upsertStrategyInStorage,
} from '../services/strategyStorage'
import type {
  BacktestStrategyRecord,
  LiveStrategyRecord,
  ThirdPartyStrategyRecord,
  StrategyChannel,
  StrategyCollection,
  StrategyRecord,
} from '../types/strategy'

interface StrategyContextValue {
  isLoading: boolean
  backtestStrategies: BacktestStrategyRecord[]
  liveStrategies: LiveStrategyRecord[]
  thirdpartyStrategies: ThirdPartyStrategyRecord[]
  upsertStrategy: (strategy: StrategyRecord) => Promise<void>
  deleteStrategy: (channel: StrategyChannel, id: string) => Promise<void>
  moveStrategy: (fromChannel: StrategyChannel, toChannel: StrategyChannel, id: string) => Promise<void>
  findStrategy: (
    channel: StrategyChannel,
    id: string,
  ) => BacktestStrategyRecord | LiveStrategyRecord | ThirdPartyStrategyRecord | undefined
  stats: {
    totalStrategies: number
    totalBacktest: number
    totalLive: number
    totalThirdparty: number
  }
}

const StrategyContext = createContext<StrategyContextValue | null>(null)

function getCollectionByChannel(
  channel: StrategyChannel,
  collection: StrategyCollection,
) {
  if (channel === 'backtest') {
    return collection.backtest
  }
  if (channel === 'live') {
    return collection.live
  }
  return collection.thirdparty
}

export function StrategyProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true)
  const [collection, setCollection] = useState<StrategyCollection>({
    backtest: [],
    live: [],
    thirdparty: [],
  })

  useEffect(() => {
    let active = true

    const sync = async () => {
      try {
        const next = await loadAllStrategies()
        if (!active) {
          return
        }
        setCollection(next)
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void sync()
    const timer = window.setInterval(() => {
      void sync()
    }, 5_000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const contextValue: StrategyContextValue = useMemo(
    () => ({
      isLoading,
      backtestStrategies: collection.backtest,
      liveStrategies: collection.live,
      thirdpartyStrategies: collection.thirdparty,
      upsertStrategy: async (strategy) => {
        const updated = await upsertStrategyInStorage(strategy)
        setCollection((prev) => {
          if (strategy.channel === 'backtest') {
            return { ...prev, backtest: updated as BacktestStrategyRecord[] }
          }
          if (strategy.channel === 'live') {
            return { ...prev, live: updated as LiveStrategyRecord[] }
          }
          return { ...prev, thirdparty: updated as ThirdPartyStrategyRecord[] }
        })
      },
      deleteStrategy: async (channel, id) => {
        const updated = await removeStrategyFromStorage(channel, id)
        setCollection((prev) => {
          if (channel === 'backtest') {
            return { ...prev, backtest: updated as BacktestStrategyRecord[] }
          }
          if (channel === 'live') {
            return { ...prev, live: updated as LiveStrategyRecord[] }
          }
          return { ...prev, thirdparty: updated as ThirdPartyStrategyRecord[] }
        })
      },
      moveStrategy: async (fromChannel, toChannel, id) => {
        const updated = await moveStrategyInStorage(fromChannel, toChannel, id)
        setCollection(updated)
      },
      findStrategy: (channel, id) =>
        getCollectionByChannel(channel, collection).find((item) => item.id === id),
      stats: {
        totalStrategies: collection.backtest.length + collection.live.length + collection.thirdparty.length,
        totalBacktest: collection.backtest.length,
        totalLive: collection.live.length,
        totalThirdparty: collection.thirdparty.length,
      },
    }),
    [collection, isLoading],
  )

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

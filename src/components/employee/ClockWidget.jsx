import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ActionButton from '../ui/ActionButton'
import Badge from '../ui/Badge'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useTimeclockStore } from '../../store/timeclockStore'
import {
  dayStart, dayEnd,
  setWorking, setLunch, setMaterialRun, setWaiting,
} from '../../api/timeclock'
import { formatTime } from '../../utils/format'

const STATUS_CONFIG = {
  traveling:    { label: 'Traveling',     color: 'traveling',    badge: 'traveling' },
  working:      { label: 'Working',       color: 'working',      badge: 'working' },
  lunch:        { label: 'Lunch',         color: 'lunch',        badge: 'lunch' },
  material_run: { label: 'Material Run',  color: 'material_run', badge: 'material_run' },
  waiting:      { label: 'Waiting',       color: 'waiting',      badge: 'waiting' },
  done:         { label: 'Done for Day',  color: 'done',         badge: 'done' },
}

function useGPSAction(apiFn, onSuccess) {
  const [loading, setLoading] = useState(false)
  const run = (extra = {}) => {
    setLoading(true)
    const attempt = (lat, lng, accuracy) =>
      apiFn({ lat, lng, accuracy, ...extra })
        .then(onSuccess)
        .finally(() => setLoading(false))
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => attempt(coords.latitude, coords.longitude, coords.accuracy),
        () => attempt(null, null, null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      )
    } else {
      attempt(null, null, null)
    }
  }
  return { run, loading }
}

export default function ClockWidget() {
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const { statusLabel, currentEntry, activeJob, dayStarted, setTimeclockData } = useTimeclockStore()
  const [error, setError] = useState(null)

  const refresh = (data) => {
    setTimeclockData(data)
    setError(null)
  }

  const startDay = useGPSAction(dayStart, refresh)
  const endDay = useGPSAction(dayEnd, refresh)
  const working = useGPSAction(setWorking, refresh)
  const lunch = useGPSAction(setLunch, refresh)
  const materialRun = useGPSAction(setMaterialRun, refresh)
  const waiting = useGPSAction(setWaiting, refresh)

  const disabled = !isOnline

  const currentConfig = statusLabel ? STATUS_CONFIG[statusLabel] : null

  return (
    <div className="flex flex-col gap-4">
      {/* Status header */}
      <div className="bg-brand-900 rounded-2xl p-5 text-white">
        <p className="text-sm text-brand-100 mb-1">Current Status</p>
        {currentConfig ? (
          <div className="flex items-center gap-3">
            <Badge variant={currentConfig.badge} className="text-sm px-3 py-1">
              {currentConfig.label}
            </Badge>
            {currentEntry?.start_time && (
              <span className="text-brand-100 text-sm">
                since {formatTime(currentEntry.start_time)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-lg font-semibold">Not clocked in</p>
        )}
        {activeJob && (
          <p className="text-brand-100 text-sm mt-2 truncate">
            📍 {activeJob.name} — {activeJob.client_name}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm text-center font-medium">
          No internet — clock actions unavailable
        </div>
      )}

      {/* Action grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Not started */}
        {!dayStarted && !statusLabel && (
          <ActionButton
            label="Start My Day"
            sublabel="Begin paid time"
            icon="☀️"
            color="indigo"
            disabled={disabled}
            loading={startDay.loading}
            onClick={() => startDay.run()}
            className="col-span-2"
          />
        )}

        {/* Day started, no status yet — needs to pick a job to travel */}
        {dayStarted && !statusLabel && (
          <ActionButton
            label="Start Traveling"
            sublabel="Select a job"
            icon="🚗"
            color="sky"
            disabled={disabled}
            onClick={() => navigate('/clock')}
            className="col-span-2"
          />
        )}

        {/* Traveling */}
        {statusLabel === 'traveling' && (
          <>
            <ActionButton label="Mark Arrival" sublabel="At jobsite" icon="📍" color="green"
              disabled={disabled} onClick={() => navigate('/clock?action=arrival')} />
            <ActionButton label="Lunch" sublabel="Paid break" icon="🍽️" color="amber"
              disabled={disabled} loading={lunch.loading} onClick={() => lunch.run()} />
            <ActionButton label="Material Run" sublabel="Getting supplies" icon="🏪" color="violet"
              disabled={disabled} loading={materialRun.loading} onClick={() => materialRun.run()} />
            <ActionButton label="Waiting" sublabel="On hold" icon="⏳" color="orange"
              disabled={disabled} loading={waiting.loading} onClick={() => waiting.run()} />
            <ActionButton label="Done" sublabel="End paid day" icon="🏁" color="gray"
              disabled={disabled} loading={endDay.loading} onClick={() => endDay.run()}
              className="col-span-2" />
          </>
        )}

        {/* Working */}
        {(statusLabel === 'working' || statusLabel === null && activeJob) && statusLabel === 'working' && (
          <>
            <ActionButton label="Lunch" sublabel="Paid break" icon="🍽️" color="amber"
              disabled={disabled} loading={lunch.loading} onClick={() => lunch.run()} />
            <ActionButton label="Material Run" sublabel="Getting supplies" icon="🏪" color="violet"
              disabled={disabled} loading={materialRun.loading} onClick={() => materialRun.run()} />
            <ActionButton label="Waiting" sublabel="On hold" icon="⏳" color="orange"
              disabled={disabled} loading={waiting.loading} onClick={() => waiting.run()} />
            <ActionButton label="Traveling" sublabel="Go to another job" icon="🚗" color="sky"
              disabled={disabled} onClick={() => navigate('/clock')} />
            <ActionButton label="Done" sublabel="End paid day" icon="🏁" color="gray"
              disabled={disabled} loading={endDay.loading} onClick={() => endDay.run()}
              className="col-span-2" />
          </>
        )}

        {/* Lunch */}
        {statusLabel === 'lunch' && (
          <>
            <ActionButton label="Working" sublabel="Back to work" icon="🔨" color="green"
              disabled={disabled} loading={working.loading} onClick={() => working.run()} />
            <ActionButton label="Traveling" sublabel="Go to another job" icon="🚗" color="sky"
              disabled={disabled} onClick={() => navigate('/clock')} />
            <ActionButton label="Material Run" sublabel="Getting supplies" icon="🏪" color="violet"
              disabled={disabled} loading={materialRun.loading} onClick={() => materialRun.run()} />
            <ActionButton label="Waiting" sublabel="On hold" icon="⏳" color="orange"
              disabled={disabled} loading={waiting.loading} onClick={() => waiting.run()} />
            <ActionButton label="Done" sublabel="End paid day" icon="🏁" color="gray"
              disabled={disabled} loading={endDay.loading} onClick={() => endDay.run()}
              className="col-span-2" />
          </>
        )}

        {/* Material Run */}
        {statusLabel === 'material_run' && (
          <>
            <ActionButton label="Working" sublabel="Back to work" icon="🔨" color="green"
              disabled={disabled} loading={working.loading} onClick={() => working.run()} />
            <ActionButton label="Traveling" sublabel="Go to another job" icon="🚗" color="sky"
              disabled={disabled} onClick={() => navigate('/clock')} />
            <ActionButton label="Lunch" sublabel="Paid break" icon="🍽️" color="amber"
              disabled={disabled} loading={lunch.loading} onClick={() => lunch.run()} />
            <ActionButton label="Waiting" sublabel="On hold" icon="⏳" color="orange"
              disabled={disabled} loading={waiting.loading} onClick={() => waiting.run()} />
            <ActionButton label="Done" sublabel="End paid day" icon="🏁" color="gray"
              disabled={disabled} loading={endDay.loading} onClick={() => endDay.run()}
              className="col-span-2" />
          </>
        )}

        {/* Waiting */}
        {statusLabel === 'waiting' && (
          <>
            <ActionButton label="Working" sublabel="Back to work" icon="🔨" color="green"
              disabled={disabled} loading={working.loading} onClick={() => working.run()} />
            <ActionButton label="Traveling" sublabel="Go to another job" icon="🚗" color="sky"
              disabled={disabled} onClick={() => navigate('/clock')} />
            <ActionButton label="Lunch" sublabel="Paid break" icon="🍽️" color="amber"
              disabled={disabled} loading={lunch.loading} onClick={() => lunch.run()} />
            <ActionButton label="Material Run" sublabel="Getting supplies" icon="🏪" color="violet"
              disabled={disabled} loading={materialRun.loading} onClick={() => materialRun.run()} />
            <ActionButton label="Done" sublabel="End paid day" icon="🏁" color="gray"
              disabled={disabled} loading={endDay.loading} onClick={() => endDay.run()}
              className="col-span-2" />
          </>
        )}

        {/* Done */}
        {statusLabel === 'done' && (
          <div className="col-span-2 text-center py-4 text-gray-500 text-sm">
            Day completed. See you tomorrow!
          </div>
        )}
      </div>
    </div>
  )
}

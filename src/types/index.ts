export type WorkPlatform = 'C64' | 'Amiga'

export type Filter = 'All' | WorkPlatform

export interface Stat {
  value: string
  label: string
}

export interface HistoryEntry {
  year: string
  platform: WorkPlatform
  title: string
  desc: string
}

export interface Award {
  year: string
  place: number
  demo: string
  event: string
  type: string
}

export interface Work {
  title: string
  platform: WorkPlatform
  type: string
  year: string
  desc: string
  crew: string[]
}

export interface Member {
  handle: string
  role: string
  realName: string
  years: string
  country: string
  bio: string
}
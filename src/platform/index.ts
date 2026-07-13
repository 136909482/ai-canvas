import { desktopPlatformBridge, isElectronRuntime } from '@/platform/desktop/desktopPlatform'
import { browserPlatformBridge } from '@/platform/web/browserPlatform'
import type { PlatformRuntimeKind } from '@/platform/types'

export const platformRuntime: PlatformRuntimeKind = isElectronRuntime() ? 'desktop' : 'web'
export const platformBridge = platformRuntime === 'desktop' ? desktopPlatformBridge : browserPlatformBridge

export { isElectronRuntime }

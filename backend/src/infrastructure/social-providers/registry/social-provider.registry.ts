import { Injectable } from '@nestjs/common'
import {
  SocialProviderPort,
  SocialPlatform,
} from '../../../domain/shared/ports/social-provider.port.js'

@Injectable()
export class SocialProviderRegistry {
  private readonly providers = new Map<SocialPlatform, SocialProviderPort>()

  register(provider: SocialProviderPort): void {
    this.providers.set(provider.platform, provider)
  }

  get(platform: SocialPlatform): SocialProviderPort {
    const provider = this.providers.get(platform)
    if (!provider) {
      throw new Error(`No provider registered for platform: ${platform}`)
    }
    return provider
  }

  getSupportedPlatforms(): SocialPlatform[] {
    return Array.from(this.providers.keys())
  }
}

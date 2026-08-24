import { useGLTF } from '@react-three/drei'

/**
 * Self-hosted Draco decoder. drei's default is a gstatic URL, which puts a
 * cross-origin fetch of ~250 KB in front of the first compressed model (all of
 * ours are Draco-compressed). It must be set before any `useGLTF` call — drei
 * keys its cache on the loader config, so a late change also re-downloads every
 * model under the new key. Import this module first, statically.
 */
useGLTF.setDecoderPath('/draco/')

export const DRACO_DECODER_PATH = '/draco/'

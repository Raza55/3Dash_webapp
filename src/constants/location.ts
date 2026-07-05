export const SYSTEM_LOCATION = {
  label: 'Jakob-Steffan-Str. 99, 55122 Mainz',
  latitude: 50.0092325,
  longitude: 8.2396362,
} as const;

export function systemLocationWithNorthOffset(northOffset?: number) {
  return {
    latitude: SYSTEM_LOCATION.latitude,
    longitude: SYSTEM_LOCATION.longitude,
    ...(northOffset !== undefined ? { northOffset } : {}),
  };
}

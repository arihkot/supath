declare module "leaflet.heat" {
  import * as L from "leaflet";

  type HeatLatLngTuple = [number, number, number?];

  interface HeatMapOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  function heatLayer(
    latlngs: HeatLatLngTuple[],
    options?: HeatMapOptions
  ): L.Layer;
}

import { render, screen, act } from '@testing-library/react'
import MapComponent from '../app/MapComponent'

// Usar variables mock permitidas
const mockDiv = document.createElement('div');
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ layers: [] }),
  })
);

jest.mock('leaflet', () => {
  const L = {
    map: jest.fn(() => ({
      setView: jest.fn().mockReturnThis(),
      on: jest.fn(),
      off: jest.fn(),
      remove: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      addControl: jest.fn(),
      removeControl: jest.fn(),
      hasLayer: jest.fn(),
      fitBounds: jest.fn(),
      getZoom: jest.fn().mockReturnValue(10),
      invalidateSize: jest.fn(),
    })),
    tileLayer: jest.fn(() => ({
      addTo: jest.fn(),
    })),
    geoJSON: jest.fn(() => ({
      addTo: jest.fn(),
      clearLayers: jest.fn(),
      addData: jest.fn(),
      getBounds: jest.fn(() => ({
        isValid: jest.fn().mockReturnValue(true),
      })),
    })),
    marker: jest.fn(() => ({
      addTo: jest.fn(),
      bindPopup: jest.fn(),
      setLatLng: jest.fn(),
      setIcon: jest.fn(),
    })),
    icon: jest.fn(),
    divIcon: jest.fn(),
    Icon: jest.fn(),
    layerGroup: jest.fn(() => ({
      addTo: jest.fn(),
      clearLayers: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
    })),
    featureGroup: jest.fn(() => ({
      addTo: jest.fn(),
      clearLayers: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
    })),
    FeatureGroup: jest.fn(() => ({
      addTo: jest.fn(),
      clearLayers: jest.fn(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
    })),
    control: {
      layers: jest.fn(() => ({
        addTo: jest.fn(),
      })),
      zoom: jest.fn(() => ({
        addTo: jest.fn(),
      })),
      scale: jest.fn(() => ({
        addTo: jest.fn(),
      })),
    },
    Draw: {
      Polygon: jest.fn(),
      Rectangle: jest.fn(),
      Event: {
        CREATED: 'draw:created',
      },
    },
    Control: {
      extend: jest.fn(() => {
        return jest.fn(() => ({
          addTo: jest.fn(),
        }))
      }),
      Draw: jest.fn(() => ({
        addTo: jest.fn(),
      })),
    },
    DomUtil: {
      create: jest.fn(() => {
        return {
          innerHTML: '',
          onclick: null,
          appendChild: jest.fn()
        }
      }),
    },
    DomEvent: {
      disableClickPropagation: jest.fn(),
      on: jest.fn(),
    },
    GeometryUtil: {
      geodesicArea: jest.fn(() => 100),
      length: jest.fn(() => 10),
    }
  }
  return L
})

jest.mock('esri-leaflet', () => ({
  dynamicMapLayer: jest.fn(() => ({
    addTo: jest.fn(),
    setOpacity: jest.fn(),
    bindPopup: jest.fn(),
    metadata: jest.fn(),
  })),
  query: jest.fn(() => ({
    layer: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    run: jest.fn((callback) => callback(null, { features: [] }, {})),
  })),
  featureLayer: jest.fn(() => ({
    addTo: jest.fn(),
    setOpacity: jest.fn(),
    bindPopup: jest.fn(),
    on: jest.fn(),
    eachFeature: jest.fn(),
    query: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      run: jest.fn((callback) => callback(null, { features: [] }, {})),
    })),
  })),
}))

jest.mock('leaflet-draw', () => ({
  Control: {
    Draw: jest.fn(() => ({
      addTo: jest.fn(),
    })),
  },
}))

// Mock matchMedia to prevent errors
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

describe('MapComponent', () => {
  it('renders correctly', async () => {
    const onCoordinatesUpdate = jest.fn()
    const onMapInitialized = jest.fn()

    await act(async () => {
      render(
        <MapComponent
          expedientCode=""
          onCoordinatesUpdate={onCoordinatesUpdate}
          searchTrigger={0}
          onMapInitialized={onMapInitialized}
          showTitleLayer={true}
          showRequestLayer={true}
          showAnmServiceLayer={true}
          showHistoricalTitleLayer={true}
          titleOpacity={0.8}
          requestOpacity={0.8}
          anmServiceOpacity={0.8}
          historicalTitleOpacity={0.8}
        />
      )
    })

    expect(screen.getByText('Satélite', { exact: false })).toBeInTheDocument()
  })
})

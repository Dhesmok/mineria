import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportComponent from './ExportComponent';
import { saveAs } from 'file-saver';
import shpwrite from '@mapbox/shp-write';

// Mock dependencies
jest.mock('file-saver', () => ({
  saveAs: jest.fn(),
}));

jest.mock('@mapbox/shp-write', () => ({
  zip: jest.fn().mockResolvedValue(new Blob(['mock-shp-data'])),
}));

const SQUARE = [
  [
    [-75.6, 6.2],
    [-75.57, 6.2],
    [-75.57, 6.23],
    [-75.6, 6.23],
    [-75.6, 6.2],
  ],
];

const geoJsonData: any = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { TENURE_ID: '12345' },
      geometry: { type: 'Polygon', coordinates: SQUARE },
    },
  ],
};

describe('ExportComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders Export buttons correctly', () => {
    render(<ExportComponent geoJsonData={geoJsonData} selectedCoordinateSystem="9377" expedientCode="12345" />);
    expect(screen.getByText('Exportar SHP')).toBeInTheDocument();
    expect(screen.getByText('Exportar KML')).toBeInTheDocument();
  });

  it('shows alert when expedientCode is not provided and export is clicked', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ExportComponent geoJsonData={geoJsonData} selectedCoordinateSystem="9377" expedientCode="" />);

    fireEvent.click(screen.getByText('Exportar SHP'));

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('No hay expediente para exportar')),
    );
  });

  it('avisa cuando no hay un resultado de búsqueda cargado', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ExportComponent geoJsonData={null} selectedCoordinateSystem="9377" expedientCode="12345" />);

    fireEvent.click(screen.getByText('Exportar SHP'));

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('No hay un resultado de búsqueda para exportar')),
    );
  });

  it('exporta el GeoJSON que ya está en el mapa, sin volver a consultar al servidor', async () => {
    // Regresión: antes se reconsultaba con `where: TENURE_ID='...'`, una condición más
    // estrecha que la de la búsqueda, y exportar fallaba para expedientes que el mapa
    // sí había encontrado.
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    render(<ExportComponent geoJsonData={geoJsonData} selectedCoordinateSystem="9377" expedientCode="12345" />);

    fireEvent.click(screen.getByText('Exportar SHP'));

    await waitFor(() => {
      expect(shpwrite.zip).toHaveBeenCalled();
      expect(saveAs).toHaveBeenCalled();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Exportando...')).not.toBeInTheDocument();
  });

  it('respeta el sistema de coordenadas seleccionado', async () => {
    // Regresión: el SHP se escribía siempre en EPSG:9377 aunque estuviera elegido
    // Magna-Sirgas.
    const { unmount } = render(
      <ExportComponent geoJsonData={geoJsonData} selectedCoordinateSystem="9377" expedientCode="12345" />,
    );
    fireEvent.click(screen.getByText('Exportar SHP'));
    await waitFor(() => expect(saveAs).toHaveBeenCalledWith(expect.anything(), '12345_EPSG-9377.zip'));

    const projected = (shpwrite.zip as jest.Mock).mock.calls[0][0];
    expect(projected.features[0].geometry.coordinates[0][0][0]).toBeGreaterThan(1000);

    unmount();
    jest.clearAllMocks();

    render(<ExportComponent geoJsonData={geoJsonData} selectedCoordinateSystem="4686" expedientCode="12345" />);
    fireEvent.click(screen.getByText('Exportar SHP'));
    await waitFor(() => expect(saveAs).toHaveBeenCalledWith(expect.anything(), '12345_EPSG-4686.zip'));

    const geographic = (shpwrite.zip as jest.Mock).mock.calls[0][0];
    expect(geographic.features[0].geometry.coordinates[0][0][0]).toBeCloseTo(-75.6, 5);
  });

  it('handles successful KML export', async () => {
    global.URL.createObjectURL = jest.fn();
    global.URL.revokeObjectURL = jest.fn();

    render(<ExportComponent geoJsonData={geoJsonData} selectedCoordinateSystem="9377" expedientCode="12345" />);

    const originalCreateElement = document.createElement.bind(document);
    const mockClick = jest.fn();
    let mockAnchor: any = null;
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        mockAnchor = {
          href: '',
          download: '',
          click: mockClick,
          style: {},
          setAttribute: jest.fn(),
        } as unknown as HTMLElement;
        return mockAnchor;
      }
      return originalCreateElement(tagName);
    });

    jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    fireEvent.click(screen.getByText('Exportar KML'));

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('12345.kml');
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });
});

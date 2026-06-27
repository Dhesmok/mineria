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

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

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
    render(<ExportComponent selectedCoordinateSystem="EPSG:4326" expedientCode="12345" />);
    expect(screen.getByText('Exportar SHP')).toBeInTheDocument();
    expect(screen.getByText('Exportar KML')).toBeInTheDocument();
  });

  it('shows alert when expedientCode is not provided and export is clicked', () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ExportComponent selectedCoordinateSystem="EPSG:4326" expedientCode="" />);

    fireEvent.click(screen.getByText('Exportar SHP'));
    expect(alertMock).toHaveBeenCalledWith('No hay expediente para exportar');

    alertMock.mockRestore();
  });

  it('handles successful SHP export', async () => {
    const mockData = {
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
          properties: { id: 1 },
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    render(<ExportComponent selectedCoordinateSystem="EPSG:4326" expedientCode="12345" />);

    fireEvent.click(screen.getByText('Exportar SHP'));

    expect(screen.getByText('Exportando...')).toBeInTheDocument();

    await waitFor(() => {
      expect(shpwrite.zip).toHaveBeenCalled();
      expect(saveAs).toHaveBeenCalled();
    });

    // Check if the state reverted back to normal
    expect(screen.queryByText('Exportando...')).not.toBeInTheDocument();
  });

  it('handles API failure gracefully during SHP export', async () => {
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});

    // Make fetch fail for all URLs
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<ExportComponent selectedCoordinateSystem="EPSG:4326" expedientCode="12345" />);

    fireEvent.click(screen.getByText('Exportar SHP'));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Hubo un error al exportar el archivo SHP'));
    });

    alertMock.mockRestore();
  });

  it('handles successful KML export', async () => {
    const mockData = {
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
          properties: { id: 1 },
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = jest.fn();
    global.URL.revokeObjectURL = jest.fn();

    render(<ExportComponent selectedCoordinateSystem="EPSG:4326" expedientCode="12345" />);

    // Stub click for anchor elements dynamically created
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

    expect(screen.getByText('Exportando...')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('12345.kml');
    });

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });
});

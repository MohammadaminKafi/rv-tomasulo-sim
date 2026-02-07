/**
 * Sample programs for documentation
 * Loads samples from JSON and individual .asm files
 */

export interface SampleProgram {
  id: string;
  title: string;
  description: string;
  code: string;
}

interface SampleMetadata {
  id: string;
  title: string;
  description: string;
  codePath: string;
}

interface SamplesConfig {
  samples: SampleMetadata[];
}

let cachedSamples: SampleProgram[] | null = null;

/**
 * Load all sample programs from JSON + .asm files
 */
export async function loadSamplePrograms(): Promise<SampleProgram[]> {
  if (cachedSamples) {
    return cachedSamples;
  }

  try {
    // Get the base URL from Vite config
    // In dev mode BASE_URL is usually '/', in production it could be '/rv-tomasulo-sim/'
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const samplesJsonUrl = `${baseUrl}samples/samples.json`;
    
    console.log('Loading samples from', samplesJsonUrl);
    // Fetch samples metadata
    const response = await fetch(samplesJsonUrl);
    if (!response.ok) {
      console.error('Failed to fetch samples.json:', response.status, response.statusText);
      throw new Error(`Failed to load samples.json: ${response.status}`);
    }
    const config: SamplesConfig = await response.json();
    console.log('Loaded samples metadata:', config.samples.length, 'samples');

    // Load code for each sample
    const samples = await Promise.all(
      config.samples.map(async (meta) => {
        const codeUrl = `${baseUrl}${meta.codePath}`;
        console.log(`Loading ${codeUrl}...`);
        const codeResponse = await fetch(codeUrl);
        if (!codeResponse.ok) {
          console.error(`Failed to load ${meta.codePath}:`, codeResponse.status);
          return {
            id: meta.id,
            title: meta.title,
            description: meta.description,
            code: `# Error loading ${meta.codePath}`,
          };
        }
        const code = await codeResponse.text();
        return {
          id: meta.id,
          title: meta.title,
          description: meta.description,
          code: code.trim(),
        };
      })
    );

    cachedSamples = samples;
    console.log('Successfully loaded all samples:', samples.length);
    return samples;
  } catch (error) {
    console.error('Error loading sample programs:', error);
    // Return empty array as fallback - this will keep "Loading samples..." visible
    return [];
  }
}

/**
 * Synchronous access to samples (must be loaded first)
 * For backward compatibility
 */
export const samplePrograms: SampleProgram[] = [];

// Auto-load samples when module is imported
loadSamplePrograms().then((samples) => {
  samplePrograms.length = 0;
  samplePrograms.push(...samples);
});



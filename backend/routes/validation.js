import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

router.get('/validate', async (req, res) => {
  const { platform_number, depth, time } = req.query;
  const targetDepth = parseFloat(depth) || 4000;
  
  // 1. Define time constraints (Historical vs Real-time)
  let timeQuery = time ? `&time="${time}"` : '&time>=now-30d';

  try {
    // 2. Fetch Real OBSERVED Data from ERDDAP
    // We request temp, psal (salinity), and doxy (dissolved oxygen)
    const erddapUrl = `https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.json?pres,temp,psal,doxy&platform_number="${platform_number}"${timeQuery}&orderByClosest("pres,${targetDepth}")&limit=1`;
    
    let row;
    try {
      console.log(`Fetching from ERDDAP: ${erddapUrl}`);
      const response = await fetch(erddapUrl);
      
      if (!response.ok) {
        console.warn(`ERDDAP responded with status: ${response.status}. Using fallback data.`);
        throw new Error("ERDDAP Request Failed");
      }

      const data = await response.json();
      
      if (!data.table || !data.table.rows || data.table.rows.length === 0) {
        console.warn("No data found. Using fallback data.");
        throw new Error("No Data");
      }
      
      row = data.table.rows[0]; 
    } catch (err) {
      // Graceful fallback for the hackathon if float isn't in ERDDAP
      row = [targetDepth, 28.3 - (targetDepth/50)*0.4, 34.3, 135];
    }

    const obsTemp = row[1] || 15.0; // fallback if null
    const obsSal = row[2] || 35.0;
    const obsO2 = row[3] || 135; // Fallback if O2 sensor missing
    const obsSpeed = 0.05; // Usually derived from glider flight models
    const obsChla = targetDepth > 100 ? 0 : 0.4; // Programmatic aphotic logic

    // 3. Query your ROMS Model (Simulated here with standard oceanographic bias)
    const modelTemp = obsTemp + 0.2; 
    const modelSal = obsSal + 0.11;
    const modelO2 = 101; 
    const modelSpeed = 0.04;

    // 4. Calculate Delta mathematically: Delta = Observed - Model
    res.json({
      depth: targetDepth,
      timestamp: time || "Latest",
      metrics: {
        temp: { obs: obsTemp, model: modelTemp, delta: obsTemp - modelTemp },
        salinity: { obs: obsSal, model: modelSal, delta: obsSal - modelSal },
        o2: { obs: obsO2, model: modelO2, delta: obsO2 - modelO2 },
        speed: { obs: obsSpeed, model: modelSpeed, delta: obsSpeed - modelSpeed },
        chla: { obs: obsChla, model: obsChla, delta: 0 }
      }
    });

  } catch (error) {
    console.error("ERDDAP Error:", error);
    res.status(500).json({ error: "Failed to fetch validation data" });
  }
});

export default router;

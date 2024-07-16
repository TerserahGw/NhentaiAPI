import express from 'express';
import cron from 'node-cron';
import { NHentai } from '@shineiichijo/nhentai-ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
const cookie_value = 'cf_clearance=hScUYYW2Cy7cqxup8LNoSGhSdtu8rP7UKg7_IcBR3yg-1713277222-1.0.1.1-k6E9Qg7QSxFrQKK00569A7SG91JBWbopKtKLzOjVvrjTglOsSD29ZhykNAcrB.4WwTrBA8HqBSyGLQSn_Vhotg';
const nhentai = new NHentai({ site: 'nhentai.net', user_agent, cookie_value });
const app = express();
const port = process.env.PORT || 80;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deleteFileAfterOneHour = (pdfPath) => {
    setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            console.log(`File deleted: ${pdfPath}`);
        }
    }, 3600000);
};

cron.schedule('* * * * *', async () => {
    try {
        const { data } = await nhentai.explore();
        console.log('Updated');
    } catch (error) {
        console.error('Error exploring nhentai:', error);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/doujin', async (req, res) => {
    const query = req.query.q;
    const hostname = req.hostname;

    if (!query) {
        return res.status(400).send('Query parameter "q" is required');
    }

    let success = false;
    while (!success) {
        try {
            const randomPage = Math.floor(Math.random() * 10) + 1;
            const { data } = await nhentai.search(query, { page: randomPage });

            if (data.length === 0) {
                continue;
            }

            const randomIndex = Math.floor(Math.random() * data.length);
            const doujin = data[randomIndex];
            const doujinTitle = doujin.title;
            const { images } = await doujin.getContents();

            const tempDir = '/tmp';
            const pdfFilename = path.join(tempDir, `${doujinTitle}.pdf`);

            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            await images.PDF(pdfFilename);

            const fileUrl = `http://${hostname}/nsfw/${encodeURIComponent(doujinTitle)}.pdf`;
            res.json({ url: fileUrl });

            deleteFileAfterOneHour(pdfFilename);

            success = true;
        } catch (error) {
            console.error('Error searching nhentai or saving file:', error);
            if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
            }
        }
    }
});

app.use('/nsfw', (req, res, next) => {
    const filePath = path.join('/tmp', req.path);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('open', () => {
        fileStream.pipe(res);
    });

    fileStream.on('error', (err) => {
        console.error('Error streaming file:', err);
        res.status(500).send('Internal Server Error');
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});

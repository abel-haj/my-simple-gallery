// server.js
const express = require("express");
const Path = require("path");
const fs = require("fs");
const mv = require("mv");
const l = console.log;

// Constants
const VIDEO_FORMAT = [".mp4", ".webm"];
const IMAGE_FORMAT = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const PORT = 3000;
const MAIN_PATH = "new_folder";
const ENABLE_RANDOMIZATION = true;
const TIME_INTERVAL = 1000 * 60 * 2; // 2 minutes for file grouping

const app = express();
const appPath = __dirname;
app.use(express.json());

// Helper Functions
const isSupportedMediaFile = (file) => {
  const ext = Path.extname(file);
  return [...VIDEO_FORMAT, ...IMAGE_FORMAT].includes(
    ext.toLowerCase()
  );
};

const getMediaFiles = (directory) => {
  let result = [[], []];

  // Get folders
  result[0] = fs
    .readdirSync(directory)
    .filter((file) =>
      fs.statSync(Path.join(directory, file)).isDirectory()
    );

  // Get files
  let files = fs
    .readdirSync(directory)
    .filter(
      (file) =>
        isSupportedMediaFile(file) &&
        fs.statSync(Path.join(directory, file)).isFile()
    )
    .map((file) => ({
      name: file,
      time: fs.statSync(Path.join(directory, file)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time); // Sort by modification time (newest first)

  if (files.length > 0) {
    if (ENABLE_RANDOMIZATION) {
      let groupedFiles = [];
      let currentGroup = [files[0]];

      // Group files based on the TIME_INTERVAL
      for (let i = 1; i < files.length; i++) {
        if (files[i - 1].time - files[i].time <= TIME_INTERVAL) {
          currentGroup.push(files[i]);
        } else {
          groupedFiles.push(currentGroup);
          currentGroup = [files[i]];
        }
      }
      groupedFiles.push(currentGroup);

      // Randomize the order of groups
      groupedFiles = groupedFiles.sort(() => Math.random() - 0.5);

      // Flatten the groups while preserving the order within each group
      files = groupedFiles.flat();
    }
  }

  result[1] = files.map((file) => file.name);
  return result;
};

// HTML Generation Helpers
const generateBackButton = (path) => `
    <div class="">
        <a class="link-btn bg-b sticky sticky-left" href="${path}">
            BACK
        </a>
    </div>
`;

const generateFolderLink = (prefixPath, folder) => `
    <div class="">
        <a class="link-btn" href="${prefixPath + "/" + folder}">
            ${folder}
        </a>
    </div>
`;

const generateVideoItem = (path, file, additionalCaptions = "") => `
    <div class="media-gallery-item video-icon">
        ${additionalCaptions}
        <a data-caption="Media" href="${path}" id="${file}"  class="video-link">
            <video src="${path}" 
                   class="video-js vjs-default-skin ridge" 
                   loop volume=0.5 muted 
                   onloadstart="this.playbackRate=2;">
            </video>
        </a>
    </div>`;

const generateImageItem = (path, file, additionalCaptions = "") => `
    <div class="media-gallery-item">
        ${additionalCaptions}
        <a data-fancybox="gallery" 
           data-caption="Media" 
           href="${path}" 
           id="${file}">
            <img src="${path}" 
                 alt="Media" 
                 class="media-gallery-image">
        </a>
    </div>`;

const generateMediaItem = (
  prefixPath,
  file,
  additionalCaptions = ""
) => {
  const ext = Path.extname(file);
  const path = prefixPath + "/" + file;

  if (VIDEO_FORMAT.includes(ext)) {
    return generateVideoItem(path, file, additionalCaptions);
  } else if (IMAGE_FORMAT.includes(ext)) {
    return generateImageItem(path, file, additionalCaptions);
  }
  return "";
};

const generateMediaGallery = (
  prefixPath,
  mediaFolders,
  mediaFiles
) => {
  let galleryHTML = fs.readFileSync(
    Path.join(__dirname, "gallery.html"),
    "utf8"
  );

  // Generate folder links
  let folders = mediaFolders.map((folder) =>
    generateFolderLink(prefixPath, folder)
  );

  // Add back button if not in root
  if (prefixPath !== "/") {
    const parentFolder = prefixPath.split("/").slice(0, -1).join("/");
    folders.unshift(generateBackButton(parentFolder));
  }

  // Generate media items
  const mediaItems = mediaFiles.map((file) =>
    generateMediaItem(prefixPath, file)
  );

  // Replace placeholders in template
  galleryHTML = galleryHTML.replace(
    "<!-- Folders will be dynamically added here -->",
    folders.join("")
  );
  galleryHTML = galleryHTML.replace(
    "<!-- Images/videos will be dynamically added here -->",
    mediaItems.join("")
  );

  return galleryHTML;
};

// Route Handlers
const handleDuplicates = (req, res) => {
  const searchDirectory = (dir, fileList = {}) => {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const fullPath = Path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        searchDirectory(fullPath, fileList);
      } else {
        if (!fileList[file]) {
          fileList[file] = [];
        }
        fileList[file].push(fullPath.replace(appPath, ""));
      }
    });
    return fileList;
  };

  const allFiles = searchDirectory(appPath + "/" + MAIN_PATH);
  const duplicates = Object.entries(allFiles)
    .filter(([file, paths]) => paths.length > 1)
    .map(([file, paths]) => ({ file, paths }));

  let galleryHTML = fs.readFileSync(
    Path.join(__dirname, "gallery.html"),
    "utf8"
  );
  let folders = [];

  folders.unshift(generateBackButton("/" + MAIN_PATH));

  galleryHTML = galleryHTML.replace(
    "<!-- Folders will be dynamically added here -->",
    "<div>" + duplicates.length + "</div>" + folders.join("")
  );
  // console.log('IS IT HERE', duplicates);

  const mediaItems = duplicates
    .map((file) => {
      return file.paths.map((path) => {
        const captions = `<span class="duplicate-caption" style="top:10px;bottom:unset;">${
          file.file
        }</span><span class="duplicate-caption">${path
          .replace(file.file, "")
          .replace("\\", "/")}</span>`;
        return generateMediaItem(
          path.replace(file.file, ""),
          file.file,
          captions
        );
      });
    })
    .flat();

  galleryHTML = galleryHTML.replace(
    "<!-- Images/videos will be dynamically added here -->",
    mediaItems.join("")
  );

  res.send(galleryHTML);
};

const handleFolders = (req, res) => {
  const getFolders = (dir) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((file) => {
          try {
            return fs.statSync(Path.join(dir, file)).isDirectory();
          } catch (err) {
            console.error(
              `Error checking if ${file} is directory:`,
              err
            );
            return false;
          }
        })
        .map((folder) => ({
          name: decodeURIComponent(folder),
          path: encodeURI(
            Path.relative(appPath, Path.join(dir, folder))
          ),
        }));
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err);
      return [];
    }
  };

  try {
    const folderPath = Path.join(
      appPath,
      decodeURIComponent(req.query.path || MAIN_PATH)
    );
    const folders = getFolders(folderPath);
    return res.json(folders);
  } catch (error) {
    console.error("Error fetching folders:", error);
    return res.status(500).send("Error fetching folders");
  }
};

const handleCreateDirectory = (req, res) => {
  const { name, currentLocation } = req.body;

  if (!name || !currentLocation) {
    res
      .status(400)
      .send("Invalid request: name and currentLocation are required");
    return;
  }

  const fullPath = Path.join(
    appPath,
    decodeURIComponent(currentLocation),
    name
  );

  if (fs.existsSync(fullPath)) {
    res.status(400).send("Directory already exists");
    return;
  }

  fs.mkdir(fullPath, { recursive: true }, (err) => {
    if (err) {
      console.error("Error creating directory:", err);
      res.status(500).send("Error creating directory");
      return;
    }
    res.send("Directory created successfully");
  });
};

const handleMoveItems = (req, res) => {
  const { itemIds, currentLocation, newLocation } = req.body;

  const currentFullPath = Path.join(
    appPath,
    decodeURIComponent(currentLocation)
  );
  const newFullPath = Path.join(
    appPath,
    decodeURIComponent(newLocation)
  );

  if (
    !fs.existsSync(newFullPath) ||
    !fs.statSync(newFullPath).isDirectory()
  ) {
    res.status(400).send("Invalid new location");
    return;
  }

  let successCount = 0;
  let failedCount = 0;
  let failedItems = [];
  let pendingOperations = itemIds.length;

  itemIds.forEach((itemId) => {
    const decodedItemId = decodeURIComponent(itemId);
    const oldPath = Path.join(currentFullPath, decodedItemId);
    const newPath = Path.join(newFullPath, decodedItemId);

    if (!fs.existsSync(oldPath) || !fs.statSync(oldPath).isFile()) {
      console.error(`File ${decodedItemId} does not exist`);
      failedCount++;
      failedItems.push(decodedItemId);
      pendingOperations--;

      if (pendingOperations === 0) {
        res.send(
          `${successCount} items moved successfully.\nFailed: ${failedCount}.\nFailed items: ${failedItems.join(
            ", "
          )}`
        );
      }
      return;
    }

    mv(oldPath, newPath, function (err) {
      pendingOperations--;

      if (err) {
        console.error(`Error moving file ${decodedItemId}: ${err}`);
        failedCount++;
        failedItems.push(decodedItemId);
      } else {
        successCount++;
      }

      if (pendingOperations === 0) {
        res.send(
          `${successCount} items moved successfully.\nFailed: ${failedCount}.\nFailed items: ${failedItems.join(
            ", "
          )}`
        );
      }
    });
  });
};

const handleDeleteItems = async (req, res) => {
  const { itemIds, currentLocation } = req.body;

  let deletedCount = 0;
  let failedCount = 0;
  let failedItems = [];

  try {
    await Promise.all(
      itemIds.map(async (itemId) => {
        const decodedItemId = decodeURIComponent(itemId);
        let fullPath;

        // Handle duplicates page differently
        // if (currentLocation === "/duplicates") {
        //   // For duplicates, the itemId is the full path
        //   fullPath = Path.join(appPath, decodedItemId);
        // } else {
        fullPath = Path.join(
          appPath,
          decodeURIComponent(currentLocation),
          decodedItemId
        );
        // }

        console.log("DELETING", decodedItemId);

        try {
          if (
            !fs.existsSync(fullPath) ||
            !fs.statSync(fullPath).isFile()
          ) {
            throw new Error(`File ${decodedItemId} does not exist`);
          }

          l("FULL PATH", fullPath);
          const renamedPath = fullPath.replace(
            decodedItemId,
            `deleted_${Path.basename(decodedItemId)}`
          );
          l("RENAMED PATH", renamedPath);
          await fs.promises.rename(fullPath, renamedPath);
          await fs.promises.unlink(renamedPath);
          deletedCount++;
        } catch (error) {
          failedCount++;
          failedItems.push(decodedItemId);
          console.error(
            `Error processing file ${decodedItemId}: ${error.message}`
          );
        }
      })
    );

    res.send(
      `File deletion process completed.\nDeleted: ${deletedCount}\nFailed: ${failedCount}\nFailed items: ${failedItems.join(
        ", "
      )}`
    );
  } catch (error) {
    console.error("Unexpected error during deletion:", error.message);
    res
      .status(500)
      .send(
        `Unexpected error during deletion. Error: ${error.message}`
      );
  }
};

// Routes
app.get("/*", (req, res) => {
  req.url = decodeURI(req.url);
  // console.log("SHNAHWA DABA HADA", req.url);

  if (req.url === "/duplicates") {
    return handleDuplicates(req, res);
  } else if (req.url.startsWith("/folders")) {
    return handleFolders(req, res);
  } else if (req.url === "/") {
    res.send(
      "<style>body{background-color: #1e1e1e;color:#f0f0f0;}</style>" +
        [
          "Are you sure?",
          "Are you sure you are sure?",
          "Are you forgetting something?",
          "Are you sure you are not forgetting something?",
          "Try again",
          "Try again, but better",
        ]
          .sort(() => Math.random() - 0.5)
          .pop()
    );
    return;
  }

  const fullPath = Path.join(appPath, req.url);
  if (!fs.existsSync(fullPath)) {
    console.log("MAJATCH", fullPath);
    res.send("Are you sure?");
    return;
  }

  if (fs.statSync(fullPath).isFile()) {
    return res.sendFile(fullPath);
  }

  const mediaFiles = getMediaFiles(fullPath);
  const mediaGallery = generateMediaGallery(
    req.url,
    mediaFiles[0],
    mediaFiles[1]
  );
  res.send(mediaGallery);
});

app.post("/createDirectory", handleCreateDirectory);
app.post("/moveItems", handleMoveItems);
app.delete("/deleteItems", handleDeleteItems);

// Start server
app.listen(PORT, () =>
  console.log(`Server is running on port ${PORT}`)
);

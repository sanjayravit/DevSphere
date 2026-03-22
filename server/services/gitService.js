const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const Project = require('../models/Project');

const GIT_CACHE_DIR = path.join(__dirname, '..', 'git-cache');

if (!fs.existsSync(GIT_CACHE_DIR)) {
    fs.mkdirSync(GIT_CACHE_DIR, { recursive: true });
}

// Ensure the local git dir reflects the MongoDB state
const syncProjectToDisk = async (projectId) => {
    const project = await Project.findById(projectId);
    if (!project) throw new Error("Project not found");

    const repoDir = path.join(GIT_CACHE_DIR, projectId.toString());

    // Create dir if doesn't exist
    if (!fs.existsSync(repoDir)) {
        fs.mkdirSync(repoDir, { recursive: true });
    }

    const git = simpleGit(repoDir);

    // Check if git is initialized
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
        await git.init();
        await git.addConfig('user.name', 'DevSphere AI');
        await git.addConfig('user.email', 'ai@devsphere.io');
    }

    // Write all project files to disk
    for (const file of project.files) {
        fs.writeFileSync(path.join(repoDir, file.name), file.content);
    }

    return { git, repoDir };
};

exports.commitCode = async (projectId, message, authorName) => {
    try {
        const { git } = await syncProjectToDisk(projectId);

        await git.add('.');
        const status = await git.status();

        if (status.isClean()) {
            return { success: true, message: "No changes to commit.", committed: false };
        }

        const commitResult = await git.commit(message || "Auto-commit from DevSphere", {
            '--author': `"${authorName} <${authorName.replace(/\s+/g, '').toLowerCase()}@users.devsphere.local>"`
        });

        return { success: true, message: "Changes committed successfully.", commitId: commitResult.commit, committed: true };
    } catch (err) {
        console.error("Git Commit Error:", err);
        throw err;
    }
};

exports.getHistory = async (projectId) => {
    try {
        const { git } = await syncProjectToDisk(projectId);
        const log = await git.log();
        return log.all; // Array of commit objects
    } catch (err) {
        // If no commits yet or fatal git error, return empty history
        return [];
    }
};

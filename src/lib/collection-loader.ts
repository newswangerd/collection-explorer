import { spawn } from 'child_process';
import * as FS from 'fs';
import * as Path from 'path';
import { capitalize } from 'lodash';

import {
    DirectoriesType,
    CollectionsType,
    DocsEntryType,
    DocsIndexType,
    ImporterResultType,
    ImportStatusType
} from '../types';
import { CollectionPathFinder, getBasePath, StateHelper, Config } from '../lib';

export class CollectionLoader {
    // Returns a list of directories with their respective collections
    static getCollectionList(): { collections: CollectionsType; directories: DirectoriesType } {
        const directories: DirectoriesType = { byID: {} };
        const collections: CollectionsType = { byID: {} };
        const collection_paths = CollectionPathFinder.getPaths();

        for (const p of collection_paths) {
            const col = this.loadDir(p);

            directories.byID[StateHelper.getID(p)] = {
                path: p,
                collectionIDs: Object.keys(col.byID)
            };

            collections.byID = { ...collections.byID, ...col.byID };
        }

        return { collections: collections, directories: directories };
    }

    static getCollection(collectionID: string): ImporterResultType {
        try {
            return JSON.parse(FS.readFileSync(this.getCachePath(collectionID)).toString());
        } catch {
            return null;
        }
    }

    static importCollection(
        collection_path: string,
        collectionID: string,
        callbacks?: { onStandardErr?: (message) => void; onStandardOut?: (message) => void }
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const rootDir = getBasePath();
            let exe: string;
            let path: string;
            const args = [];
            // if running in production mode, use the bundled python scripts
            if (process.env.NODE_ENV === 'production') {
                exe = Path.join(rootDir, 'python', 'dist', 'importer_wrapper', 'importer_wrapper');
                path = `${Path.join(rootDir, 'python', 'dist', 'ansible-doc')}:${Path.join(
                    rootDir,
                    'python',
                    'dist',
                    'ansible-lint'
                )}:${process.env.PATH}`;
            } else {
                exe = 'python';
                path = process.env.PATH;
                args.push('python/importer_wrapper.py');
            }

            const p = spawn(exe, args.concat([collection_path, this.getCachePath(collectionID)]), {
                env: {
                    PATH: path
                }
            });

            p.stdout.on('data', data => {
                if (callbacks && callbacks.onStandardOut) {
                    callbacks.onStandardOut(data);
                }
            });
            p.stderr.on('data', data => {
                if (callbacks && callbacks.onStandardErr) {
                    callbacks.onStandardErr(data);
                }
                // console.error(`stderr: ${data}`);
            });
            p.on('exit', code => {
                // this.setState({ collection: JSON.parse(allData.join()) });
                // console.log(JSON.parse(allData.join()));

                if (code === 0) {
                    resolve(code);
                } else {
                    reject(code);
                }
            });
        });
    }

    static getCollectionIndex(docsBlob) {
        const table: DocsIndexType = {
            documentation: [],
            modules: [],
            roles: [],
            plugins: [],
            playbooks: []
        };

        table.documentation.push({
            display: 'Readme',
            type: 'docs',
            name: 'readme'
        });

        if (docsBlob.documentation_files) {
            for (const file of docsBlob.documentation_files) {
                table.documentation.push({
                    display: capitalize(
                        file.name
                            .split('.')[0]
                            .split('_')
                            .join(' ')
                    ),
                    // selected: selectedType === 'docs' && selectedName === url,
                    type: 'docs',
                    name: file.name
                });
            }
        }

        const getContentEntry = (content): DocsEntryType => {
            return {
                display: content.content_name,
                name: content.content_name,
                type: content.content_type
            };
        };

        if (docsBlob.contents) {
            for (const content of docsBlob.contents) {
                switch (content.content_type) {
                    case 'role':
                        table.roles.push(getContentEntry(content));
                        break;
                    case 'module':
                        table.modules.push(getContentEntry(content));
                        break;
                    case 'playbook':
                        table.playbooks.push(getContentEntry(content));
                        break;
                    default:
                        table.plugins.push(getContentEntry(content));
                        break;
                }
            }
        }

        // Sort docs
        for (const k of Object.keys(table)) {
            table[k].sort((a, b) => {
                // Make sure that anything starting with _ goes to the bottom
                // of the list
                if (a.display.startsWith('_') && !b.display.startsWith('_')) {
                    return 1;
                }
                if (!a.display.startsWith('_') && b.display.startsWith('_')) {
                    return -1;
                }
                return a.display > b.display ? 1 : -1;
            });
        }

        return table;
    }

    static getContent(
        collection,
        selectedName,
        selectedType
    ): { type: 'plugin' | 'html'; data: any } {
        let displayHTML: string;
        let pluginData;

        if (selectedType === 'docs' && selectedName && selectedName !== 'readme') {
            if (collection.docs_blob.documentation_files) {
                const file = collection.docs_blob.documentation_files.find(
                    x => x.name === selectedName
                );

                if (file) {
                    return { type: 'html', data: file.html };
                }
            }
        } else if (selectedType !== 'docs' && selectedName) {
            // check if contents exists
            if (collection.docs_blob.contents) {
                const content = collection.docs_blob.contents.find(
                    x => x.content_type === selectedType && x.content_name === selectedName
                );

                if (content) {
                    if (selectedType === 'role') {
                        return { type: 'html', data: content['readme_html'] };
                    } else {
                        return { type: 'plugin', data: content };
                    }
                }
            }
        } else {
            if (collection.docs_blob.collection_readme) {
                return { type: 'html', data: collection.docs_blob.collection_readme.html };
            }
        }

        return null;
    }

    private static loadDir(collectionsDir): CollectionsType {
        // Returns a list of collection in a given directory
        const collections: CollectionsType = { byID: {} };
        for (const ns of FS.readdirSync(collectionsDir)) {
            if (FS.statSync(Path.join(collectionsDir, ns)).isDirectory()) {
                for (const collection of FS.readdirSync(Path.join(collectionsDir, ns))) {
                    const collectionDir = Path.join(collectionsDir, ns, collection);

                    if (
                        FS.statSync(collectionDir).isDirectory() &&
                        this.isCollection(FS.readdirSync(collectionDir))
                    ) {
                        const collectionPath = Path.join(collectionsDir, ns, collection);
                        const id = StateHelper.getID(collectionPath);
                        let index = null;
                        let metadata = null;
                        let status: ImportStatusType = ImportStatusType.loading;

                        // don't load the index for collections that are out of
                        // date. This will cause the collection to get reimported
                        if (!this.needsRefresh(collectionPath, id)) {
                            const importerData = this.getCollection(id);
                            status = ImportStatusType.imported;

                            if (importerData) {
                                index = this.getCollectionIndex(importerData.docs_blob);
                                metadata = importerData.metadata;
                            }
                        }

                        collections.byID[id] = {
                            name: collection,
                            namespace: ns,
                            path: collectionPath,
                            index: index,
                            metadata: metadata,
                            status: status
                        };
                    }
                }
            }
        }

        return collections;
    }

    private static needsRefresh(collectionPath: string, collectionID: string): boolean {
        if (FS.existsSync(this.getCachePath(collectionID))) {
            const collection = FS.statSync(collectionPath);
            const collectionCache = FS.statSync(this.getCachePath(collectionID));

            return collection.mtime > collectionCache.mtime;
        }
        return true;
    }

    private static getCachePath(collectionID) {
        return Path.join(Config.getCacheDir(), collectionID);
    }

    private static isCollection(files: string[]): boolean {
        return (
            files.includes('MANIFEST.json') ||
            files.includes('galaxy.yaml') ||
            files.includes('galaxy.yml')
        );
    }
}

import * as React from 'react';
import './collection-loader.scss';

import { CollectionLoader } from '../../lib';
import { Button, Tooltip } from '@patternfly/react-core';
import { RedoIcon } from '@patternfly/react-icons';

import { Tab, CollectionList } from '../components';

import { ViewType, TabType, DirectoriesType, CollectionsType } from '../../types';

interface IState {
    directories: DirectoriesType;
    collections: CollectionsType;
    contentSelected: {
        tab: number;
    };

    sidebarState: {
        expandedIDs: string[];
    };

    tabs: TabType[];
}

// renders markdown files in collection docs/ directory
export class Root extends React.Component<{}, IState> {
    docsRef: any;

    constructor(props) {
        super(props);

        this.state = {
            directories: { byID: {} },
            collections: { byID: {} },

            sidebarState: {
                expandedIDs: []
            },

            contentSelected: {
                tab: 0
            },
            tabs: [{ view: null, data: null }]
        };

        this.docsRef = React.createRef();
    }

    componentDidMount() {
        this.loadCollectionList();
    }

    render() {
        const { directories, collections, tabs, contentSelected, sidebarState } = this.state;
        console.log(this.state);
        return (
            <div className="main">
                <div>
                    <CollectionList
                        directories={directories}
                        collections={collections}
                        sidebarState={sidebarState}
                        toggleExpand={id => this.toggleExpand(id)}
                        loadContent={(collectionID, name, type) =>
                            this.loadContent(collectionID, name, type)
                        }
                        importCollection={collectionID => this.importCollection(collectionID)}
                    />
                </div>
                <div className="docs-col">
                    <Tab
                        tabs={tabs}
                        contentSelected={contentSelected}
                        collections={collections}
                        importCollection={collectionID => this.importCollection(collectionID)}
                    />
                </div>
            </div>
        );
    }

    private loadContent(collectionID, name, type) {
        const collection = CollectionLoader.getCollection(
            this.state.collections.byID[collectionID].path
        );
        const tabID = this.state.contentSelected.tab;

        const content = CollectionLoader.getContent(collection, name, type);
        console.log(collection);
        const newTabs = [...this.state.tabs];

        if (content.type === ViewType.plugin) {
            newTabs[tabID] = {
                view: ViewType.plugin,
                data: { plugin: content.data, collectionID: collectionID }
            };
        } else {
            newTabs[tabID] = {
                view: ViewType.html,
                data: { html: content.data, collectionID: collectionID }
            };
        }

        this.setState({ tabs: newTabs });
    }

    private toggleExpand(id) {
        const newSidebarState = { ...this.state.sidebarState };
        const expanded = newSidebarState.expandedIDs;

        const i = expanded.findIndex(x => x === id);
        if (i === -1) {
            expanded.push(id);
        } else {
            expanded.splice(i, 1);
        }

        this.setState({ sidebarState: newSidebarState });
    }

    private loadCollectionList() {
        const data = CollectionLoader.getCollectionList();
        this.setState({ directories: data.directories, collections: data.collections });
    }
    private importCollection(collectionID: string) {
        const tabs = [...this.state.tabs];
        const currentTab = this.state.contentSelected.tab;
        tabs[currentTab] = {
            view: ViewType.loading,
            data: { collectionID: collectionID }
        };
        this.setState({ tabs: tabs }, () => {
            CollectionLoader.importCollection(this.state.collections.byID[collectionID].path, {
                onStandardErr: error => console.error(`stderr: ${error.toString()}`)
            })
                .then(() => {
                    this.loadCollectionIndex(collectionID);
                })
                .catch(() => {
                    const newTabs = [...tabs];
                    newTabs[currentTab] = {
                        view: ViewType.error,
                        data: { collectionID: collectionID }
                    };
                    this.setState({ tabs: newTabs });
                });
        });
    }

    private loadCollectionIndex(collectionID) {
        const data = CollectionLoader.getCollection(this.state.collections.byID[collectionID].path);
        const newCollections = { ...this.state.collections };
        newCollections.byID[collectionID].index = CollectionLoader.getCollectionIndex(
            data.docs_blob
        );
        this.setState({ collections: newCollections });
    }
}

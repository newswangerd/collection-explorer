import sys
import json
import attr
import os

from galaxy_importer import collection


def main():
    filepath = sys.argv[1]
    savepath = sys.argv[2]

    # Modified importer to importer directory instead of tarball
    data = collection.CollectionLoader(filepath, filepath).load()

    # probably shouldn't cache the importer in the collection dir since we may
    # not have write access to it
    json_data = json.dumps(attr.asdict(data), indent=2)

    with open(os.path.join(savepath), 'w+') as output_file:
        output_file.write(json_data)


main()

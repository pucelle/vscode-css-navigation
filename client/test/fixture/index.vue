<style scoped>
    .test-vue-scoped-class{
        color: red;
    }
</style>

<style scoped lang="css">
    .test-vue-scoped-class-css{
        color: red;
    }
</style>

<style scoped lang="scss">
    .test-vue-scoped-class-scss{
        &-scss{
            color: red;
        }
    }
</style>

<style scoped lang="less">
    .test-vue-scoped-class-less{
        &-less{
            color: red;
        }
    }
</style>

<template>
    <div class="test-vue-scoped-class">Test Text</div>
    <div class="test-vue-scoped-class-css">Test Text</div>
    <div class="test-vue-scoped-class-scss">Test Text</div>
    <div class="test-vue-scoped-class-less">Test Text</div>

    <div class="test-vue-import-class">Test Text</div>
    <div class="class-style-imported">Test Text</div>
</template>


<script>

// Import in a <script> is not working recently.
import "./css/test.scss"
import "./node_modules/test-module/style-imported.scss"

</script>
